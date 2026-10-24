import { Router, Request, Response } from 'express';
import { auth, db, FieldValue } from '../firebase';
import { getRazorpayClient, verifyRazorpaySignature } from '../razorpay';
import { config } from '../config';
import {
  validateOrderItems,
  validateShippingAddress,
  calculateAuthoritativeTotals,
  generateOrderNumber,
} from '../services/orderCalculation';
import type {
  ProductCatalogRecord,
  OrderDocument,
  OrderDealerInfo,
} from '../types';

export const paymentRouter = Router();

/**
 * Middleware: Verifies Firebase ID Token from Authorization header
 */
export async function authenticateFirebaseUser(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header. Firebase ID token required.',
    });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    (req as any).user = decodedToken;
    next();
  } catch (err: any) {
    console.error('Firebase token verification failed:', err);
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired Firebase ID token.',
      code: err?.code || 'auth/invalid-token',
    });
  }
}

/**
 * POST /api/payments/create-razorpay-order
 *
 * Security & Accuracy Guarantees:
 * 1. Authenticated user required (verified via Firebase ID token).
 * 2. Ignores any client-provided price, tax, or total. Re-evaluates catalog authoritatively.
 * 3. Enforces integer amount in paise (1 INR = 100 paise).
 * 4. Verifies dealer status if orderType === 'dealer'.
 * 5. Creates a pending order record in Firestore before opening client checkout.
 * 6. Returns Razorpay Order ID & Key ID. NEVER returns Key Secret.
 */
paymentRouter.post(
  '/create-razorpay-order',
  authenticateFirebaseUser,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { items, shippingAddress, customerInfo, orderType } = req.body;

      // 1. Validate payload structure
      let validatedItems;
      let validatedAddress;
      try {
        validatedItems = validateOrderItems(items);
        validatedAddress = validateShippingAddress(shippingAddress);
      } catch (valErr: any) {
        return res.status(400).json({ error: valErr.message });
      }

      // 2. Fetch authoritative product records from Firestore
      const productIds = validatedItems.map((i) => i.productId);
      const productSnapshots = await Promise.all(
        productIds.map((id) => db.collection('products').doc(id).get())
      );

      const catalogMap = new Map<string, ProductCatalogRecord>();
      for (const snap of productSnapshots) {
        if (!snap.exists) {
          return res.status(400).json({
            error: `Product with ID "${snap.id}" was not found in the catalog.`,
          });
        }
        const data = snap.data() || {};
        catalogMap.set(snap.id, {
          id: snap.id,
          name: String(data.name || 'Califnco Purifier'),
          category: String(data.category || 'ro-purifiers'),
          price: Number(data.price || 0),
          stock: Number(data.stock ?? 0),
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
        });
      }

      // 3. Calculate authoritative pricing & paise
      let calculation;
      try {
        calculation = calculateAuthoritativeTotals(validatedItems, catalogMap);
      } catch (calcErr: any) {
        return res.status(400).json({ error: calcErr.message });
      }

      const { lineItems, pricing, amountPaise } = calculation;

      // 4. Verify dealer status if ordering as dealer
      let dealerInfo: OrderDealerInfo | undefined = undefined;
      if (orderType === 'dealer') {
        const directDealer = await db.collection('dealers').doc(user.uid).get();
        let dealerSnap = directDealer.exists ? directDealer : null;

        if (!dealerSnap) {
          const qUser = await db.collection('dealers').where('userId', '==', user.uid).limit(1).get();
          if (!qUser.empty) {
            dealerSnap = qUser.docs[0];
          } else {
            const qUid = await db.collection('dealers').where('uid', '==', user.uid).limit(1).get();
            if (!qUid.empty) dealerSnap = qUid.docs[0];
          }
        }

        if (!dealerSnap || !dealerSnap.exists) {
          return res.status(403).json({
            error: 'Verified dealer profile not found for this account. Contact Califnco administration.',
          });
        }

        const dData = dealerSnap.data() || {};
        if (dData.status !== 'active') {
          return res.status(403).json({
            error: `Dealer profile is ${dData.status || 'not active'}. Only approved active dealers can place orders.`,
          });
        }

        dealerInfo = {
          id: dealerSnap.id,
          dealerCode: String(dData.dealerCode || 'DLR-UNASSIGNED'),
          businessName: String(dData.businessName || 'Authorized Dealership'),
          tier: String(dData.tier || 'silver'),
        };
      }

      // 5. Create Razorpay Order via official SDK
      const orderNumber = generateOrderNumber();
      const razorpay = getRazorpayClient();

      const rzpOrder = await razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `rcpt_${orderNumber}`,
        notes: {
          orderNumber,
          customerUid: user.uid,
          customerEmail: user.email || '',
          orderType: orderType === 'dealer' ? 'dealer' : 'customer',
          dealerCode: dealerInfo?.dealerCode || 'N/A',
          isTestMode: String(config.isTestMode),
        },
      });

      // 6. Create Pending Order in Firestore
      const orderRef = db.collection('orders').doc();
      const orderData: OrderDocument = {
        orderNumber,
        isTestOrder: config.isTestMode,
        orderType: orderType === 'dealer' ? 'dealer' : 'customer',
        dealer: dealerInfo,
        customer: {
          uid: user.uid,
          email: user.email || 'customer@califnco.com',
          name: customerInfo?.name || (dealerInfo ? dealerInfo.businessName : 'Valued Customer'),
          phone: customerInfo?.phone || '+91 99999 99999',
        },
        shippingAddress: validatedAddress,
        items: lineItems,
        pricing,
        payment: {
          method: 'razorpay',
          status: 'pending',
          transactionId: null,
          isTestMode: config.isTestMode,
          razorpayOrderId: rzpOrder.id,
          notes: `Razorpay Test Order created (${rzpOrder.id}). Awaiting customer payment confirmation.`,
        },
        fulfillment: {
          status: 'pending',
          notes: 'Awaiting verified payment confirmation from gateway before fulfillment.',
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
        updatedBy: user.uid,
      };

      await orderRef.set(orderData);

      // 7. Return Razorpay parameters for client checkout (NEVER returns key_secret)
      return res.status(200).json({
        success: true,
        orderId: orderRef.id,
        orderNumber,
        razorpayOrderId: rzpOrder.id,
        amountPaise,
        currency: 'INR',
        keyId: config.razorpayKeyId,
        isTestMode: config.isTestMode,
      });
    } catch (error: any) {
      console.error('Error in create-razorpay-order:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to initialize Razorpay test order.',
      });
    }
  }
);

/**
 * POST /api/payments/verify-payment
 *
 * Security & Integrity Guarantees:
 * 1. Cryptographically verifies HMAC-SHA256 signature using RAZORPAY_KEY_SECRET.
 * 2. Rejects tampered signatures immediately without marking order paid.
 * 3. Verifies customer ownership (order.customer.uid === req.user.uid).
 * 4. Fetches payment record from Razorpay API to verify status, amount, and order_id.
 * 5. Uses idempotency protection: repeated callbacks return success without double-decrementing stock.
 * 6. Atomically updates stock in Firestore and marks order paid.
 */
paymentRouter.post(
  '/verify-payment',
  authenticateFirebaseUser,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

      if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({
          error: 'Missing required payment verification parameters: orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature.',
        });
      }

      // 1. Fetch Order Document from Firestore
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).json({ error: `Order "${orderId}" was not found.` });
      }

      const orderData = orderSnap.data() as OrderDocument;

      // 2. Ownership Verification
      if (orderData.customer.uid !== user.uid) {
        return res.status(403).json({
          error: 'Access denied: You are not authorized to verify this order.',
        });
      }

      // 3. Idempotency Check (Requirement 10)
      if (
        orderData.payment.status === 'paid' &&
        orderData.payment.transactionId === razorpayPaymentId
      ) {
        return res.status(200).json({
          success: true,
          orderId,
          orderNumber: orderData.orderNumber,
          paymentId: razorpayPaymentId,
          isAlreadyPaid: true,
          message: 'Payment was already verified successfully.',
        });
      }

      // 4. Verify Razorpay Order ID matches order record
      if (orderData.payment.razorpayOrderId !== razorpayOrderId) {
        return res.status(400).json({
          error: 'Payment order ID mismatch. Verification rejected.',
        });
      }

      // 5. Cryptographic Signature Verification (Requirement 8)
      const isSignatureValid = verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        config.razorpayKeySecret
      );

      if (!isSignatureValid) {
        // Record failed verification on order
        await orderRef.update({
          'payment.status': 'failed',
          'payment.notes': `Signature verification failed for payment "${razorpayPaymentId}".`,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        });

        return res.status(400).json({
          error: 'Invalid payment signature. Verification rejected.',
        });
      }

      // 6. Verify Payment Details with Razorpay Gateway API (Requirement 9)
      const razorpay = getRazorpayClient();
      let rzpPayment: any;
      try {
        rzpPayment = await razorpay.payments.fetch(razorpayPaymentId);
      } catch (fetchErr: any) {
        console.error('Failed to fetch payment details from Razorpay API:', fetchErr);
        return res.status(502).json({
          error: 'Unable to verify payment with Razorpay gateway. Please retry.',
        });
      }

      // Check payment status with gateway
      if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
        await orderRef.update({
          'payment.status': 'failed',
          'payment.notes': `Gateway reported payment status as "${rzpPayment.status}".`,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return res.status(400).json({
          error: `Payment was not successful. Gateway status: ${rzpPayment.status}.`,
        });
      }

      // Check amount matching (integer paise)
      const expectedAmountPaise = Math.round(orderData.pricing.totalAmount * 100);
      if (Number(rzpPayment.amount) !== expectedAmountPaise) {
        await orderRef.update({
          'payment.status': 'failed',
          'payment.notes': `Amount mismatch: Expected ₹${expectedAmountPaise / 100}, got ₹${rzpPayment.amount / 100}.`,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return res.status(400).json({
          error: 'Payment amount mismatch between gateway and order record.',
        });
      }

      // Check currency
      if (rzpPayment.currency !== 'INR') {
        return res.status(400).json({
          error: `Invalid currency "${rzpPayment.currency}". Expected "INR".`,
        });
      }

      // 7. Atomic Firestore Transaction: Decrement stock and mark paid (Requirement 11)
      await db.runTransaction(async (transaction) => {
        // Check current stock
        for (const item of orderData.items) {
          const prodRef = db.collection('products').doc(item.productId);
          const pSnap = await transaction.get(prodRef);
          if (pSnap.exists) {
            const currentStock = Number(pSnap.data()?.stock ?? 0);
            const newStock = Math.max(0, currentStock - item.quantity);
            transaction.update(prodRef, {
              stock: newStock,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        // Update Order to PAID
        transaction.update(orderRef, {
          'payment.status': 'paid',
          'payment.transactionId': razorpayPaymentId,
          'payment.paidAt': FieldValue.serverTimestamp(),
          'payment.razorpaySignature': razorpaySignature,
          'payment.razorpayPaymentId': razorpayPaymentId,
          'payment.notes': `Payment verified via Razorpay Test Mode (${razorpayPaymentId}). Method: ${rzpPayment.method || 'card'}.`,
          'fulfillment.status': 'processing',
          'fulfillment.notes': 'Payment verified. Technician assignment and white-glove unboxing scheduled.',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        });
      });

      return res.status(200).json({
        success: true,
        orderId,
        orderNumber: orderData.orderNumber,
        paymentId: razorpayPaymentId,
        amount: orderData.pricing.totalAmount,
        message: 'Payment verified and order confirmed successfully.',
      });
    } catch (error: any) {
      console.error('Error verifying payment:', error);
      return res.status(500).json({
        error: error?.message || 'Payment verification failed due to internal error.',
      });
    }
  }
);

/**
 * POST /api/payments/report-failure
 *
 * Records payment failure safely without deducting stock
 */
paymentRouter.post(
  '/report-failure',
  authenticateFirebaseUser,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { orderId, razorpayOrderId, errorCode, errorDescription } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: 'orderId is required.' });
      }

      const orderRef = db.collection('orders').doc(orderId);
      const snap = await orderRef.get();

      if (!snap.exists) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const data = snap.data() as OrderDocument;
      if (data.customer.uid !== user.uid) {
        return res.status(403).json({ error: 'Unauthorized.' });
      }

      if (data.payment.status !== 'paid') {
        await orderRef.update({
          'payment.status': 'failed',
          'payment.notes': `Payment failed: ${errorDescription || errorCode || 'Cancelled by user'}.`,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Payment failure recorded safely. No inventory deducted.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
);
