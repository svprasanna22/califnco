# Califnco Razorpay Test Mode & Render Backend Integration Guide

## 1. Overview & Architecture

Califnco requires a secure, production-grade payment architecture that operates strictly within the **Firebase Spark Free Tier** without requiring Cloud Functions v2 or Firebase Blaze upgrades.

The payment system delegates all authoritative operations to a standalone **Node.js Express backend** hosted on **Render** paired with the **React Native Expo** mobile application.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CALIFNCO PAYMENT ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

  [ Mobile App (Expo) ]
           │
           │ 1. Request Order (Firebase ID Token, Product IDs, Address)
           ▼
  [ Secure Render Backend (Express + TypeScript) ]
           │
           │ 2. Authenticate Firebase ID Token (Firebase Admin SDK)
           │ 3. Fetch Authoritative Prices & Stock from Firestore
           │ 4. Compute Total Amount in Paise (e.g. ₹23,600 = 2360000 paise)
           │ 5. Call Razorpay API: razorpay.orders.create() (Using Key Secret)
           │ 6. Write Pending Order to Firestore (`payment.status = "pending"`)
           │
           │ 7. Return { orderId, razorpayOrderId, amountPaise, keyId }
           ▼
  [ Mobile App (Expo) ]
           │
           │ 8. Open Razorpay Checkout (Using Test Key ID + razorpayOrderId)
           │ 9. Customer Authorizes Payment (Test Card / Test UPI)
           │
           │ 10. Submit Verification Payload:
           │     { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
           ▼
  [ Secure Render Backend (Express + TypeScript) ]
           │
           │ 11. Authenticate Firebase ID Token & Customer Ownership
           │ 12. Idempotency Check: Ignore if already marked 'paid'
           │ 13. Cryptographic HMAC-SHA256 Signature Verification:
           │     crypto.createHmac('sha256', secret).update(order_id + "|" + payment_id)
           │ 14. Fetch Payment Record from Razorpay API:
           │     Verify status === 'captured', amount === expectedPaise, currency === 'INR'
           │ 15. Atomic Firestore Transaction:
           │     - Decrement product inventory stock
           │     - Update order: payment.status = 'paid', fulfillment.status = 'processing'
           │
           │ 16. Return { success: true, orderNumber, paymentId }
           ▼
  [ Mobile App (Expo) ]
           │
           │ 17. Clear Cart, Display Verified Order Confirmation Modal
```

---

## 2. Key Security Guarantees

1. **Zero Client-Side Trust on Pricing**:
   The mobile client never submits payable amounts to the backend. The backend queries Firestore `products` directly, enforces 18% GST calculation, and converts to integer paise.
2. **Key Secret Confidentiality**:
   `RAZORPAY_KEY_SECRET` and Firebase Service Account keys exist **exclusively** in the Render backend environment. Mobile code only receives `RAZORPAY_KEY_ID`.
3. **Cryptographic Signature Verification**:
   The client's checkout callback is never treated as proof of payment. The backend validates the HMAC-SHA256 hash using the secret key before marking any order paid.
4. **Idempotency Protection**:
   Duplicate callbacks or retries for the same `razorpayPaymentId` return success immediately without double-decrementing product inventory.
5. **Inventory Protection on Failure**:
   If a payment fails, is declined, or is cancelled, stock is preserved. The order is recorded with `payment.status: "failed"` and no inventory is deducted.
6. **Firebase Spark Free Plan Preserved**:
   Firebase Cloud Functions deployment is avoided entirely. Firebase Admin SDK connects to Firestore securely over standard HTTPS.

---

## 3. Razorpay Dashboard Setup (Test Mode)

### Step 1: Create a Razorpay Account
1. Visit [https://dashboard.razorpay.com](https://dashboard.razorpay.com) and create or log in to your account.
2. Toggle the switch in the top header from **Live Mode** to **Test Mode**. The interface will display a yellow banner: `TEST MODE`.

### Step 2: Generate Test API Keys
1. In the left navigation menu, go to **Settings** → **API Keys**.
2. Click **Generate Test Key** (or **Regenerate Key** if you already had one).
3. Copy both values:
   - **Key ID**: Starts with `rzp_test_...` (e.g., `rzp_test_1DP5mmOlF5G5ag`)
   - **Key Secret**: A 24-character random string (e.g., `s9df87s6d87f6sd87fs6df8s`)
4. **Important**: Store the Key Secret securely in your password manager. It is never displayed again by Razorpay.

---

## 4. Render Backend Deployment

The backend resides in the `backend/` directory of this repository.

### Step 1: Create a New Web Service on Render
1. Log in to [https://dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your Git repository (`Califnco`).
4. Configure the service settings:
   - **Name**: `califnco-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Region**: `Singapore` or `Frankfurt` (closest to your users)
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

### Step 2: Configure Render Environment Secrets
In the Render Service dashboard, navigate to **Environment** and add the following environment variables:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Node environment |
| `PORT` | `8080` | Server listening port |
| `RAZORPAY_KEY_ID` | `rzp_test_xxxxxxxxxxxxxx` | Razorpay Test Key ID |
| `RAZORPAY_KEY_SECRET` | `xxxxxxxxxxxxxxxxxxxxxxxx` | Razorpay Test Key Secret |
| `FIREBASE_PROJECT_ID` | `califnco-app-f2b7c` | Firebase Project ID |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@califnco-app-f2b7c.iam.gserviceaccount.com` | Firebase Admin Service Account email |
| `FIREBASE_PRIVATE_KEY` | `"-----BEGIN PRIVATE KEY-----\nMIIEvgIB...-----END PRIVATE KEY-----\n"` | Firebase Admin private key with `\n` |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |

> [!NOTE]
> To generate the Firebase Admin service account key:
> 1. Go to **Firebase Console** → **Project Settings** → **Service Accounts**.
> 2. Click **Generate New Private Key**.
> 3. Copy `client_email` and `private_key` into the Render environment variables.

---

## 5. React Native Expo Integration: Expo Go vs. Development Build

### Why Expo Go Cannot Run Native Razorpay
The official `react-native-razorpay` library is a native wrapper around `com.razorpay.checkout.Checkout` (Android) and `Razorpay.framework` (iOS).

Expo Go is a pre-compiled binary that does not include third-party native Android/iOS SDKs. Attempting to invoke `react-native-razorpay` in standard Expo Go causes:
```
Native module cannot be null / Invariant Violation: NativeModule.RazorpayCheckout is not available.
```

### Approach 1: Testing in Expo Go (Current Implementation)
The Califnco mobile app includes an interactive **In-App Test Checkout Modal** (`RazorpayCheckoutModal.tsx`):
- Uses backend-generated Razorpay order IDs (`order_...`) and test Key ID.
- Displays standard Razorpay test card presets (`4111 1111 1111 1111`) and virtual UPI handles (`success@razorpay`).
- Forwards verification data to the Render backend, which validates the signature against Razorpay and decrements inventory atomically.
- Allows testing success, decline, and cancellation flows seamlessly without native build overhead.

### Approach 2: Native Development Build (`react-native-razorpay`)
To launch the native Razorpay Activity / View Controller in a native build:

1. **Install native dependencies in `mobile/`**:
   ```bash
   cd mobile
   npx expo install react-native-razorpay
   ```

2. **Add Android permissions in `mobile/app.json`**:
   ```json
   {
     "expo": {
       "android": {
         "permissions": [
           "android.permission.INTERNET",
           "android.permission.ACCESS_NETWORK_STATE"
         ]
       }
     }
   }
   ```

3. **Prebuild & run on physical device / emulator**:
   ```bash
   npx expo prebuild
   npx expo run:android
   # or for iOS:
   npx expo run:ios
   ```

4. **Invoke `react-native-razorpay` in code**:
   ```typescript
   import RazorpayCheckout from 'react-native-razorpay';

   const options = {
     description: 'Califnco Water Purifier',
     image: 'https://califnco.com/logo.png',
     currency: 'INR',
     key: orderData.keyId,
     amount: orderData.amountPaise,
     name: 'Califnco Water Technologies',
     order_id: orderData.razorpayOrderId,
     prefill: {
       email: user.email,
       contact: phone,
       name: customerName,
     },
     theme: { color: '#0284c7' }
   };

   RazorpayCheckout.open(options)
     .then((data: any) => {
       // Submit data.razorpay_payment_id, data.razorpay_order_id, data.razorpay_signature
       // to backend verify endpoint
       verifyRazorpayPaymentBackend({
         orderId: orderData.orderId,
         razorpayOrderId: data.razorpay_order_id,
         razorpayPaymentId: data.razorpay_payment_id,
         razorpaySignature: data.razorpay_signature,
       });
     })
     .catch((error: any) => {
       reportPaymentFailureBackend(orderData.orderId, orderData.razorpayOrderId, error.description);
     });
   ```

---

## 6. Testing Guide & Verification Scenarios

### Test Instruments Supported in Razorpay Test Mode

| Payment Method | Test Input | Expected Behavior |
| :--- | :--- | :--- |
| **Visa / Mastercard** | `4111 1111 1111 1111`<br>Expiry: `12/28`, CVV: `123` | Authorized instantly with simulated OTP auto-pass. |
| **Declined Card** | `4000 0000 0000 0002`<br>Expiry: `12/28`, CVV: `123` | Bank decline simulated. Order remains unpaid. No stock deducted. |
| **UPI (Success)** | `success@razorpay` | Instant push approval without PIN. |
| **UPI (Failure)** | `failure@razorpay` | Immediate decline notification. |

### Unit & Security Test Suite
Run the backend payment security suite:
```bash
cd backend
npm test
```
The test suite validates:
- **Test 1**: Tampered amounts resistance (client sends ₹1; backend uses catalog price ₹20,000 + 18% GST = ₹23,600).
- **Test 2**: Invalid / zero / excessive quantities.
- **Test 3**: Indian 6-digit postal PIN code format validation.
- **Test 4**: Insufficient inventory rejection.
- **Test 5**: Cryptographic signature verification with authentic HMAC-SHA256 signature.
- **Test 6**: Tampered signature rejection (modified hex signature is rejected).
- **Test 7**: Mismatched Order ID rejection.
- **Test 8**: Idempotency protection against duplicate webhook/callback retries.
- **Test 9**: Safe failure recording without inventory deduction.

---

## 7. Connecting Mobile Checkout to Live Render Backend

While the backend is pending deployment, mobile checkout maintains safety through:
```typescript
// mobile/src/services/orderService.ts
export const IS_BACKEND_DEPLOYED = false;
```
When `IS_BACKEND_DEPLOYED = false`:
- A clear banner is displayed: *"Checkout is not available yet. No order has been placed."*
- Direct client writes to Firestore are blocked to preserve price and stock integrity.
- No false success screen is ever presented.

### To Activate Live Backend Integration:
1. Deploy the Render backend following Section 4.
2. Note your Render URL (e.g., `https://califnco-backend.onrender.com`).
3. In `mobile/src/services/orderService.ts`:
   - Set `IS_BACKEND_DEPLOYED = true`.
   - Update `BACKEND_API_BASE_URL` or configure `EXPO_PUBLIC_BACKEND_URL` in `mobile/.env`.
4. Perform an end-to-end test order in the mobile app.

---

## 8. Switching from Test Mode to Live Mode

When ready to accept real payments from customers in India:

1. **Complete Razorpay Business Verification**:
   - Go to [Razorpay Dashboard](https://dashboard.razorpay.com).
   - Complete KYC / KYB submission (GSTIN, Company PAN, Bank Account for settlements).
2. **Generate Live API Keys**:
   - Switch toggle to **Live Mode**.
   - Navigate to **Settings** → **API Keys** → **Generate Key**.
   - Copy `rzp_live_xxxxxxxxxxxxxx` and the live key secret.
3. **Update Render Environment Variables**:
   - In Render Dashboard → `califnco-backend` → **Environment**:
     - Change `RAZORPAY_KEY_ID` to your `rzp_live_...` key.
     - Change `RAZORPAY_KEY_SECRET` to your live secret.
   - Render will automatically trigger a rolling redeploy.
4. **Safety Check**:
   - The backend automatically detects `rzp_live_` prefix:
     - Sets `isTestMode: false` on Razorpay orders.
     - Sets `isTestOrder: false` in Firestore order documents.
   - Run a live test with a low-cost accessory (e.g. ₹100 replacement filter) using a real UPI handle to verify bank settlement.
