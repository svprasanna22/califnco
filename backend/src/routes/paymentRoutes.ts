import { Router, Request, Response } from 'express';
import { auth, db, FieldValue } from '../firebase';
import { getRazorpayClient, verifyRazorpaySignature } from '../razorpay';
import { config } from '../config';
import {
  validateOrderItems,
  validateShippingAddress,
  calculateAuthoritativeTotals,
  generateOrderNumber,
  sanitizeForFirestore,
} from '../services/orderCalculation';
import { getAuthoritativeCatalogRecords } from '../services/catalogService';
import type {
  OrderDocument,
  OrderDealerInfo,
} from '../types';

export const paymentRouter = Router();

/**
 * Middleware: Verifies Firebase ID Token from Authorization header or query parameter
 */
export async function authenticateFirebaseUser(req: Request, res: Response, next: Function) {
  let idToken: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    idToken = authHeader.split('Bearer ')[1].trim();
  } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
    idToken = req.query.token.trim();
  }

  if (!idToken) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header. Firebase ID token required.',
    });
  }

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
 * Helper to verify dealer status
 */
async function getVerifiedDealerInfo(
  uid: string,
  orderType: string | undefined
): Promise<OrderDealerInfo | undefined> {
  if (orderType !== 'dealer') {
    return undefined;
  }

  const directDealer = await db.collection('dealers').doc(uid).get();
  let dealerSnap = directDealer.exists ? directDealer : null;

  if (!dealerSnap) {
    const qUser = await db.collection('dealers').where('userId', '==', uid).limit(1).get();
    if (!qUser.empty) {
      dealerSnap = qUser.docs[0];
    } else {
      const qUid = await db.collection('dealers').where('uid', '==', uid).limit(1).get();
      if (!qUid.empty) dealerSnap = qUid.docs[0];
    }
  }

  if (!dealerSnap || !dealerSnap.exists) {
    throw new Error('Verified dealer profile not found for this account. Contact Califnco administration.');
  }

  const dData = dealerSnap.data() || {};
  if (dData.status !== 'active') {
    throw new Error(
      `Dealer profile is ${dData.status || 'not active'}. Only approved active dealers can place orders.`
    );
  }

  return {
    id: dealerSnap.id,
    dealerCode: String(dData.dealerCode || 'DLR-UNASSIGNED'),
    businessName: String(dData.businessName || 'Authorized Dealership'),
    tier: String(dData.tier || 'silver'),
  };
}

/**
 * POST /api/payments/create-cod-order
 *
 * Places an authenticated Cash on Delivery order via Render backend.
 * Replaces undeployed Firebase Cloud Function on Spark plan.
 * - Authenticated caller required (Firebase ID token).
 * - Authoritative pricing and inventory check.
 * - Atomic stock decrement inside a Firestore transaction.
 * - Creates order in 'orders' collection.
 */
paymentRouter.post(
  '/create-cod-order',
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

      // 2. Fetch authoritative product records
      let catalogMap;
      try {
        catalogMap = await getAuthoritativeCatalogRecords(
          validatedItems.map((i) => i.productId)
        );
      } catch (catErr: any) {
        return res.status(400).json({ error: catErr.message });
      }

      // 3. Calculate authoritative pricing
      let calculation;
      try {
        calculation = calculateAuthoritativeTotals(validatedItems, catalogMap);
      } catch (calcErr: any) {
        return res.status(400).json({ error: calcErr.message });
      }

      const { lineItems, pricing } = calculation;

      // 4. Verify dealer status if ordering as dealer
      let dealerInfo: OrderDealerInfo | undefined;
      try {
        dealerInfo = await getVerifiedDealerInfo(user.uid, orderType);
      } catch (dealerErr: any) {
        return res.status(403).json({ error: dealerErr.message });
      }

      // 5. Atomic Firestore Transaction: Verify stock, decrement stock, create order
      const orderNumber = generateOrderNumber();
      const orderRef = db.collection('orders').doc();

      await db.runTransaction(async (transaction) => {
        // Read and verify live stock
        for (const item of lineItems) {
          const prodRef = db.collection('products').doc(item.productId);
          const pSnap = await transaction.get(prodRef);
          if (pSnap.exists) {
            const currentStock = Number(pSnap.data()?.stock ?? 0);
            if (currentStock < item.quantity) {
              throw new Error(
                `Insufficient stock for "${item.name}". Only ${currentStock} available, but ${item.quantity} requested.`
              );
            }
            transaction.update(prodRef, {
              stock: currentStock - item.quantity,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        const orderData: OrderDocument = {
          orderNumber,
          isTestOrder: config.isTestMode,
          orderType: orderType === 'dealer' ? 'dealer' : 'customer',
          ...(dealerInfo ? { dealer: dealerInfo } : {}),
          customer: {
            uid: user.uid,
            email: user.email || 'customer@califnco.com',
            name: (customerInfo?.name && customerInfo.name.trim()) || (dealerInfo ? dealerInfo.businessName : 'Valued Customer'),
            phone: (customerInfo?.phone && customerInfo.phone.trim()) || '+91 99999 99999',
          },
          shippingAddress: {
            street: validatedAddress.street,
            ...(validatedAddress.landmark?.trim()
              ? { landmark: validatedAddress.landmark.trim() }
              : {}),
            city: validatedAddress.city,
            state: validatedAddress.state,
            postalCode: validatedAddress.postalCode,
            country: validatedAddress.country || 'India',
          },
          items: lineItems,
          pricing,
          payment: {
            method: 'cash_on_delivery',
            status: 'cash_on_delivery',
            transactionId: null,
            isTestMode: config.isTestMode,
            notes: 'Cash on Delivery. Collect payment on doorstep unboxing and TDS installation.',
          },
          fulfillment: {
            status: 'pending',
            notes: 'Cash on Delivery order confirmed. Technician unboxing & installation scheduled.',
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        };

        const sanitizedPayload = sanitizeForFirestore(orderData);
        transaction.set(orderRef, sanitizedPayload);
      });

      return res.status(200).json({
        success: true,
        orderId: orderRef.id,
        orderNumber,
        totalAmount: pricing.totalAmount,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        itemCount: lineItems.length,
        paymentMethod: 'cash_on_delivery',
      });
    } catch (error: any) {
      console.error('Error in create-cod-order:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to place Cash on Delivery order.',
      });
    }
  }
);

/**
 * POST /api/payments/create-razorpay-order
 *
 * Creates a real Razorpay Order via the official Razorpay SDK.
 * - Authenticated user required (Firebase ID token).
 * - Authoritative pricing.
 * - Stores pending order in Firestore.
 * - Returns Razorpay Order ID & Key ID (NEVER returns Key Secret).
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

      // 2. Fetch authoritative product catalog
      let catalogMap;
      try {
        catalogMap = await getAuthoritativeCatalogRecords(
          validatedItems.map((i) => i.productId)
        );
      } catch (catErr: any) {
        return res.status(400).json({ error: catErr.message });
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
      let dealerInfo: OrderDealerInfo | undefined;
      try {
        dealerInfo = await getVerifiedDealerInfo(user.uid, orderType);
      } catch (dealerErr: any) {
        return res.status(403).json({ error: dealerErr.message });
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
        ...(dealerInfo ? { dealer: dealerInfo } : {}),
        customer: {
          uid: user.uid,
          email: user.email || 'customer@califnco.com',
          name: (customerInfo?.name && customerInfo.name.trim()) || (dealerInfo ? dealerInfo.businessName : 'Valued Customer'),
          phone: (customerInfo?.phone && customerInfo.phone.trim()) || '+91 99999 99999',
        },
        shippingAddress: {
          street: validatedAddress.street,
          ...(validatedAddress.landmark?.trim()
            ? { landmark: validatedAddress.landmark.trim() }
            : {}),
          city: validatedAddress.city,
          state: validatedAddress.state,
          postalCode: validatedAddress.postalCode,
          country: validatedAddress.country || 'India',
        },
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

      const sanitizedPayload = sanitizeForFirestore(orderData);
      await orderRef.set(sanitizedPayload);

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
 * 6. Atomically checks stock and decrements stock in Firestore transaction, strictly rejecting if insufficient.
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

      // 3. Idempotency Check
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

      // 5. Cryptographic Signature Verification
      const isSignatureValid = verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        config.razorpayKeySecret
      );

      if (!isSignatureValid) {
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

      // 6. Verify Payment Details with Razorpay Gateway API
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

      if (rzpPayment.order_id !== razorpayOrderId) {
        return res.status(400).json({
          error: 'Payment belongs to a different Razorpay order.',
        });
      }

      // Check payment status with gateway
      if (rzpPayment.status !== 'captured') {
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

      // 7. Atomic Firestore Transaction: Check stock, decrement stock, and mark order paid
      await db.runTransaction(async (transaction) => {
        for (const item of orderData.items) {
          const prodRef = db.collection('products').doc(item.productId);
          const pSnap = await transaction.get(prodRef);
          if (pSnap.exists) {
            const currentStock = Number(pSnap.data()?.stock ?? 0);
            if (currentStock < item.quantity) {
              throw new Error(
                `Insufficient stock for "${item.name}". Only ${currentStock} available, but ${item.quantity} requested.`
              );
            }
            transaction.update(prodRef, {
              stock: currentStock - item.quantity,
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
 * GET /api/payments/checkout-web
 *
 * Serves a lightweight web checkout page using official Razorpay checkout.js.
 * Enables real, cryptographically verifiable payments from Expo Go or browsers
 * without requiring native SDK binary linking.
 */
paymentRouter.get('/checkout-web', async (req: Request, res: Response) => {
  const { orderId } = req.query;
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).send('<h3>Error: Missing orderId parameter.</h3>');
  }

  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).send('<h3>Error: Order not found.</h3>');
    }

    const orderData = orderDoc.data() as OrderDocument;
    if (orderData.payment.status === 'paid') {
      return res.send(`
        <html>
          <head><title>Order Confirmed - Califnco</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="font-family: sans-serif; background: #0A0F1D; color: #fff; text-align: center; padding: 40px 20px;">
            <h2 style="color: #10b981;">✓ Order Already Verified & Confirmed</h2>
            <p>Order <strong>${orderData.orderNumber}</strong> is confirmed.</p>
            <p style="color: #94a3b8;">You may return to the Califnco app to view your orders.</p>
          </body>
        </html>
      `);
    }

    const razorpayOrderId = orderData.payment.razorpayOrderId;
    if (!razorpayOrderId) {
      return res.status(400).send('<h3>Error: Order does not have an associated Razorpay Order ID.</h3>');
    }

    const amountPaise = Math.round(orderData.pricing.totalAmount * 100);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Califnco Razorpay Test Checkout</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    body {
      background: #0A0F1D;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 90vh;
    }
    .card {
      background: #0f172a;
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      background: rgba(2, 132, 199, 0.2);
      color: #38bdf8;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 16px;
      letter-spacing: 0.5px;
    }
    h2 { margin: 0 0 8px 0; font-size: 20px; font-weight: 700; }
    p { margin: 0 0 20px 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
    .amount-box {
      background: #1e293b;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .amount-label { color: #94a3b8; font-size: 13px; }
    .amount-val { color: #38bdf8; font-size: 22px; font-weight: 800; }
    .btn {
      background: #0284c7;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 16px 24px;
      font-size: 16px;
      font-weight: 700;
      width: 100%;
      cursor: pointer;
      display: block;
      box-sizing: border-box;
      text-align: center;
      transition: background 0.2s;
    }
    .btn:hover { background: #0369a1; }
    #status-box {
      margin-top: 16px;
      padding: 14px;
      border-radius: 8px;
      font-size: 13px;
      display: none;
    }
    .test-credentials {
      background: rgba(30, 41, 59, 0.5);
      border-radius: 8px;
      padding: 12px;
      margin-top: 20px;
      font-size: 12px;
      color: #cbd5e1;
      border-left: 3px solid #38bdf8;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">OFFICIAL RAZORPAY TEST GATEWAY</span>
    <h2>Califnco Water Technologies</h2>
    <p>Order #${orderData.orderNumber}</p>

    <div class="amount-box">
      <span class="amount-label">Total Payable</span>
      <span class="amount-val">₹${(amountPaise / 100).toLocaleString('en-IN')}</span>
    </div>

    <button id="pay-btn" class="btn" onclick="openRazorpay()">Proceed to Razorpay Checkout</button>
    <div id="status-box"></div>

    <div class="test-credentials">
      <strong>Test Payment Instructions:</strong><br>
      • <strong>Cards:</strong> Use card <code>4111 1111 1111 1111</code>, any future expiry, CVV <code>123</code>, OTP <code>123456</code>.<br>
      • <strong>UPI:</strong> Use virtual ID <code>success@razorpay</code>.
    </div>
  </div>

  <script>
    function openRazorpay() {
      const options = {
        key: "${config.razorpayKeyId}",
        amount: ${amountPaise},
        currency: "INR",
        name: "Califnco Water Technologies",
        description: "Order #${orderData.orderNumber}",
        order_id: "${razorpayOrderId}",
        prefill: {
          name: "${(orderData.customer.name || 'Customer').replace(/"/g, '')}",
          email: "${(orderData.customer.email || 'customer@califnco.com').replace(/"/g, '')}",
          contact: "${(orderData.customer.phone || '9999999999').replace(/"/g, '')}"
        },
        theme: { color: "#0284c7" },
        handler: async function (response) {
          const statusBox = document.getElementById('status-box');
          statusBox.style.display = 'block';
          statusBox.style.background = 'rgba(56, 189, 248, 0.1)';
          statusBox.style.color = '#38bdf8';
          statusBox.innerHTML = 'Verifying cryptographic payment signature with Califnco backend...';

          try {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;

            const verifyRes = await fetch('/api/payments/verify-payment' + (token ? '?token=' + encodeURIComponent(token) : ''), {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({
                orderId: "${orderDoc.id}",
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              })
            });
            const data = await verifyRes.json();
            if (verifyRes.ok && data.success) {
              statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
              statusBox.style.color = '#10b981';
              statusBox.innerHTML = '<strong>✓ Payment Verified & Confirmed!</strong><br>Payment ID: ' + response.razorpay_payment_id + '<br>You may now switch back to the Califnco app.';
              document.getElementById('pay-btn').style.display = 'none';
            } else {
              statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
              statusBox.style.color = '#f87171';
              statusBox.innerHTML = 'Verification failed: ' + (data.error || 'Unknown error');
            }
          } catch (e) {
            statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBox.style.color = '#f87171';
            statusBox.innerHTML = 'Network error while verifying payment: ' + e.message;
          }
        }
      };
      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        const statusBox = document.getElementById('status-box');
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.color = '#f87171';
        statusBox.innerHTML = 'Payment failed: ' + (response.error.description || 'Cancelled');
      });
      rzp.open();
    }
  </script>
</body>
</html>
    `;
    return res.send(html);
  } catch (err: any) {
    return res.status(500).send(`<h3>Server error: ${err?.message}</h3>`);
  }
});

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
