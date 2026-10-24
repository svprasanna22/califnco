import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  validateOrderInput,
  validateProductStockAndComputeTotals,
  generateOrderNumber,
  type ProductCatalogRecord,
} from './orderValidation';
import type {
  OrderDocument,
  CreateOrderResponse,
} from './types';

// Initialize Firebase Admin SDK once in Cloud Functions environment
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

/**
 * Authenticated Callable Cloud Function to create an order.
 *
 * Security & Accuracy Guarantees:
 * 1. Rejects unauthenticated callers immediately (HttpsError 'unauthenticated').
 * 2. Never trusts client-provided prices, totals, taxes, customer UID, or stock counts.
 * 3. Uses an atomic Firestore transaction to:
 *    - Verify product existence and available stock.
 *    - Decrement product stock in real-time.
 *    - Record the authoritative order in the 'orders' collection.
 * 4. Strictly accepts 'cash_on_delivery' (zero fake online payment claims).
 * 5. Binds customer.uid strictly to the authenticated caller's UID.
 */
export const createOrder = onCall(
  {
    cors: true,
    region: 'us-central1',
    maxInstances: 10,
  },
  async (request): Promise<CreateOrderResponse> => {
    // 1. Authenticated Context Verification
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Authentication required: You must be signed in to your Califnco account to place an order.'
      );
    }

    const customerUid = request.auth.uid;
    const customerEmail = request.auth.token.email || 'customer@califnco.internal';

    // 2. Validate Input Payload
    let validatedInput;
    try {
      validatedInput = validateOrderInput(request.data);
    } catch (err: unknown) {
      throw new HttpsError('invalid-argument', (err as Error)?.message || 'Invalid order parameters.');
    }

    // 3. Run Atomic Firestore Transaction
    try {
      const result = await db.runTransaction(async (transaction) => {
        // A. Read all product documents concurrently inside the transaction
        const productRefs = validatedInput.items.map((item) =>
          db.collection('products').doc(item.productId)
        );
        const productSnapshots = await transaction.getAll(...productRefs);

        // B. Build Catalog Map from authoritative database state
        const productsMap = new Map<string, ProductCatalogRecord>();
        for (let i = 0; i < productSnapshots.length; i++) {
          const snap = productSnapshots[i];
          if (!snap.exists) {
            throw new HttpsError(
              'not-found',
              `Product with ID "${snap.id}" does not exist in the Califnco catalog.`
            );
          }
          const data = snap.data() || {};
          productsMap.set(snap.id, {
            id: snap.id,
            name: String(data.name || 'Water Purifier'),
            category: String(data.category || 'ro-purifiers'),
            price: Number(data.price || 0),
            stock: Number(data.stock ?? 0),
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
          });
        }

        // C. Validate Stock and Compute Authoritative Totals
        let validatedCalculation;
        try {
          validatedCalculation = validateProductStockAndComputeTotals(
            validatedInput.items,
            productsMap
          );
        } catch (calcError: unknown) {
          throw new HttpsError(
            'failed-precondition',
            (calcError as Error)?.message || 'Stock validation failed.'
          );
        }

        // C2. Dealer Profile Verification if orderType === 'dealer' (all reads before writes)
        let dealerInfo: import('./types').OrderDealerInfo | undefined = undefined;
        if (validatedInput.orderType === 'dealer') {
          const directDealerRef = db.collection('dealers').doc(customerUid);
          const directSnap = await transaction.get(directDealerRef);

          let dealerDocSnap: FirebaseFirestore.DocumentSnapshot | null = null;
          if (directSnap.exists) {
            dealerDocSnap = directSnap;
          } else {
            const qUserId = db.collection('dealers').where('userId', '==', customerUid).limit(1);
            const qSnap = await transaction.get(qUserId);
            if (!qSnap.empty) {
              dealerDocSnap = qSnap.docs[0];
            } else {
              const qUid = db.collection('dealers').where('uid', '==', customerUid).limit(1);
              const qSnapUid = await transaction.get(qUid);
              if (!qSnapUid.empty) {
                dealerDocSnap = qSnapUid.docs[0];
              }
            }
          }

          if (!dealerDocSnap || !dealerDocSnap.exists) {
            throw new HttpsError(
              'failed-precondition',
              'Verified dealer profile not found for this account. Contact Califnco administration to link your UID.'
            );
          }

          const dData = dealerDocSnap.data() || {};
          if (dData.status !== 'active') {
            throw new HttpsError(
              'failed-precondition',
              `Dealer account status is "${dData.status || 'inactive'}". Only verified active dealers can place commercial stock orders.`
            );
          }

          dealerInfo = {
            id: dealerDocSnap.id,
            dealerCode: String(dData.dealerCode || 'DLR-UNASSIGNED'),
            businessName: String(dData.businessName || 'Authorized Dealership'),
            tier: String(dData.tier || 'silver'),
          };
        }

        const { lineItems, pricing } = validatedCalculation;

        // D. Atomically Decrement Product Stock
        for (const item of validatedInput.items) {
          const productRef = db.collection('products').doc(item.productId);
          const currentRecord = productsMap.get(item.productId)!;
          const newStock = Math.max(0, currentRecord.stock - item.quantity);

          transaction.update(productRef, {
            stock: newStock,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // E. Create Authoritative Order Document
        const orderRef = db.collection('orders').doc();
        const orderNumber = generateOrderNumber();

        const orderData: OrderDocument = {
          orderNumber,
          isTestOrder: false,
          orderType: validatedInput.orderType || 'customer',
          dealer: dealerInfo,
          customer: {
            uid: customerUid,
            email: customerEmail,
            name: validatedInput.customerInfo?.name || (dealerInfo ? dealerInfo.businessName : 'Valued Customer'),
            phone: validatedInput.customerInfo?.phone || '+91 99999 99999',
          },
          shippingAddress: validatedInput.shippingAddress,
          items: lineItems,
          pricing,
          payment: {
            method: 'cash_on_delivery',
            status: 'pending',
            transactionId: null,
            collectedByTechnician: false,
            notes: validatedInput.orderType === 'dealer'
              ? `Cash on Delivery commercial order placed via authorized dealer (${dealerInfo?.dealerCode || 'DEALER'}).`
              : 'Cash on Delivery order placed via customer mobile app.',
          },
          fulfillment: {
            status: 'pending',
            notes: validatedInput.orderType === 'dealer'
              ? `New verified dealer stock order received (${dealerInfo?.businessName}). Pending dispatch scheduling.`
              : 'New verified purifier order received. Pending technician assignment.',
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: customerUid,
          updatedBy: customerUid,
        };

        transaction.set(orderRef, orderData);

        return {
          orderId: orderRef.id,
          orderNumber,
          pricing,
          itemCount: lineItems.reduce((acc, it) => acc + it.quantity, 0),
        };
      });

      return {
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        totalAmount: result.pricing.totalAmount,
        subtotal: result.pricing.subtotal,
        tax: result.pricing.tax,
        itemCount: result.itemCount,
      };
    } catch (txError: any) {
      if (txError instanceof HttpsError) {
        throw txError;
      }
      console.error('Error during order creation transaction:', txError);
      throw new HttpsError(
        'internal',
        txError?.message || 'Failed to complete order transaction. Please try again.'
      );
    }
  }
);
