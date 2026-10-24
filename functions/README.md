# Califnco Trusted Backend — Cloud Functions

This directory contains the Firebase Cloud Functions backend for the **Califnco** water purifier platform.

## Architecture & Security Model

In accordance with Califnco security standards and Cloud Firestore security rules:
- **Direct client writes to `/orders` are blocked**: Mobile and web clients cannot directly create order documents in Firestore.
- **Authoritative Server Calculation**: Product prices, 18% GST tax, and stock availability are retrieved directly from Firestore inside an atomic transaction. Client-provided prices or totals are completely ignored.
- **Atomic Stock Management**: When an order is placed, a Firestore transaction atomically validates stock and decrements inventory. If any product is out of stock or does not exist, the transaction aborts and no order is created.
- **Strict Authentication**: Only authenticated Firebase callers (`request.auth.uid`) can create an order. The authenticated UID is stored in `customer.uid`, enabling customer self-tracking in the mobile app.
- **Payment Verification**: Direct checkout only accepts `cash_on_delivery` with `status: 'pending'`. Online payments cannot be marked as paid without verified gateway webhooks.
- **Spark Plan Free Tier Operation**: When running on the Firebase Spark free plan without billing, Cloud Functions deployment is paused. The mobile application gracefully displays *"Checkout is not available yet. No order has been placed."* See [BACKEND_DEPLOYMENT_GUIDE.md](../BACKEND_DEPLOYMENT_GUIDE.md) for future hosting options.

---

## Callable Functions

### `createOrder`
- **Trigger**: HTTPS Callable (`onCall` - Firebase Functions v2)
- **Region**: `us-central1`
- **Authentication**: Required (`request.auth != null`)
- **Input Parameters**:
  ```typescript
  {
    items: Array<{ productId: string; quantity: number }>;
    shippingAddress: {
      street: string;
      landmark?: string;
      city: string;
      state: string;
      postalCode: string; // 6-digit Indian PIN
      country?: string;
    };
    customerInfo?: {
      name?: string;
      phone?: string;
    };
    paymentMethod: 'cash_on_delivery';
  }
  ```
- **Returns**:
  ```typescript
  {
    success: boolean;
    orderId: string;
    orderNumber: string; // e.g. ORD-K9L2-4821
    totalAmount: number;
    subtotal: number;
    tax: number;
    itemCount: number;
  }
  ```

---

## Running Unit Tests Locally

The unit test suite validates input sanitization, 6-digit PIN codes, stock failure rollbacks, payment method restrictions, and authoritative price calculation without requiring a live connection:

```bash
cd functions
npm test
```

---

## Deployment Instructions

### Prerequisites
1. **Firebase Blaze Plan**: Firebase Cloud Functions requires the pay-as-you-go (Blaze) plan enabled on project `califnco-app-f2b7c` in the [Firebase Console](https://console.firebase.google.com/project/califnco-app-f2b7c/usage/details).
2. **Firebase CLI Authentication**:
   ```bash
   npx firebase-tools login
   ```

### Deploying Functions
To build and deploy the functions to your Firebase project:

```bash
# In project root (C:\Califnco)
npx firebase-tools deploy --only functions
```

### Local Emulation
To run functions with the local Firestore emulator:

```bash
cd functions
npm run serve
```
