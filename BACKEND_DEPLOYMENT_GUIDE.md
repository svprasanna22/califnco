# Califnco Backend Architecture & Deployment Guide

This guide details the security model, current Firebase Spark free tier operation, and step-by-step instructions for connecting a securely hosted backend later.

---

## 1. Current State: Firebase Spark (Free) Plan

The Califnco project is currently configured to operate strictly on the **Firebase Spark (Free) Plan**:

- **No Billing Incurred**: Firebase Cloud Functions are not deployed and no credit card or paid billing is required.
- **Client Security Preserved**: Direct client-side creation of orders in Cloud Firestore remains strictly disabled by Firestore Security Rules.
- **Safe Mobile Experience**:
  - The mobile app prominently notifies users that checkout is awaiting backend deployment:
    > *"Checkout is not available yet. No order has been placed."*
  - The mobile checkout service does **not** perform unauthorized Firestore writes.
  - No false order confirmations or fake transaction records are generated.
  - The product catalogue, cart, user authentication, and admin portal remain 100% operational.
- **Backend Code Preserved**: The complete, tested TypeScript backend source code remains intact inside [`functions/`](file:///C:/Califnco/functions/) with 9 passing automated unit tests (`npm test` in `functions/`).

---

## 2. Why Direct Client Writes are Prohibited

Allowing mobile or web clients to write directly to `/orders` or update `/products` stock would introduce severe security vulnerabilities:
1. **Price Tampering**: A client could submit arbitrary unit prices, discounts, or zero totals.
2. **Tax Evasion / Inconsistency**: GST (18%) calculations could be omitted or altered.
3. **Race Conditions & Overselling**: Without server-side Firestore transactions, multiple buyers could simultaneously purchase the last unit in stock.
4. **Credential Exposure**: Bypassing rules by embedding service-account keys or admin tokens inside the mobile APK would expose the entire Firebase database.

---

## 3. Dealer Authentication & Security Model

The dealer experience enforces strict verification:
1. **Verified Relationship**:
   - The dealer record in `/dealers` must have `userId: <user.uid>` (or `uid: <user.uid>` or document ID == `<user.uid>`).
   - Email match alone is **never** accepted as proof of dealer approval.
2. **Account Status**:
   - Only `status === 'active'` permits commercial dealer ordering.
   - `pending` or `suspended` accounts are restricted.
3. **Pricing Policy**:
   - Dealer tiers (`diamond`, `gold`, `silver`, `regional_hub`, `service_partner`) represent territorial exclusivity and operational volume.
   - No discount percentages or dealer price formulas are configured in the database; standard catalogue prices apply authoritatively.
4. **Required Firestore Rule**:
   ```javascript
   match /dealers/{dealerId} {
     // Allow admins full access; allow authenticated dealers to read only their own linked record
     allow read: if request.auth != null && (
       isAdmin() ||
       resource.data.userId == request.auth.uid ||
       resource.data.uid == request.auth.uid ||
       dealerId == request.auth.uid
     );
     // Only administrators can create or update dealer records
     allow write: if isAdmin();
   }
   ```

---

## 4. Options for Connecting a Secure Backend Later

When ready to enable live order placement, choose one of the following methods:

### Option A: Firebase Cloud Functions (Recommended when on Blaze Plan)

If the Firebase project `califnco-app-f2b7c` is upgraded to the **Blaze (Pay-as-you-go)** plan in the [Firebase Console](https://console.firebase.google.com/project/califnco-app-f2b7c/usage/details):

1. **Deploy the Cloud Functions**:
   ```bash
   cd C:\Califnco
   npx firebase-tools deploy --only functions
   ```
2. **Enable Backend in the Mobile App**:
   In [`mobile/src/services/orderService.ts`](file:///C:/Califnco/mobile/src/services/orderService.ts), set:
   ```typescript
   export const IS_BACKEND_DEPLOYED = true;
   ```
3. **Test Live Checkout**:
   The mobile app will immediately invoke the callable function `createOrder`, execute atomic stock verification, and generate authoritative orders.

---

### Option B: Free / Low-Cost Self-Hosted Node.js Server (Without Firebase Blaze)

If you wish to keep the Firebase project on the Spark plan and avoid upgrading to Blaze, the backend logic in `functions/src/orderValidation.ts` can run on any free Node.js hosting platform (e.g. Render Free Web Service, Railway, Fly.io, or your own VPS):

1. **Obtain Firebase Service Account Credentials**:
   - Go to **Firebase Console** -> **Project Settings** -> **Service accounts**.
   - Click **Generate new private key** (save as `service-account.json` securely on the server; **never commit to Git or include in the mobile app**).
2. **Wrap in Express or Fastify**:
   ```typescript
   import express from 'express';
   import admin from 'firebase-admin';
   import { validateOrderInput, calculateAuthoritativeOrder, generateOrderNumber } from './orderValidation';

   admin.initializeApp({
     credential: admin.credential.cert(serviceAccount)
   });
   const db = admin.firestore();
   const app = express();
   app.use(express.json());

   // Verify Firebase ID token from mobile header
   app.post('/api/orders', async (req, res) => {
     const authHeader = req.headers.authorization;
     if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
     const idToken = authHeader.split('Bearer ')[1];
     const decodedToken = await admin.auth().verifyIdToken(idToken);

     // Execute atomic transaction using orderValidation logic...
     // Return authoritative order result
   });

   app.listen(process.env.PORT || 8080);
   ```
3. **Point Mobile App to the Hosted Endpoint**:
   In `mobile/src/services/orderService.ts`, replace `httpsCallable` with a `fetch()` call to your hosted API (`https://your-service.onrender.com/api/orders`), passing `await auth.currentUser.getIdToken()`.

---

### Option C: Local Testing via Firebase Emulator Suite

To validate the full checkout workflow locally without deploying or incurring any billing:

1. **Start the Functions and Firestore Emulators**:
   ```bash
   cd C:\Califnco
   npx firebase-tools emulators:start --only functions,firestore
   ```
2. **Connect the Mobile App to Local Emulators**:
   In [`mobile/src/services/firebase.ts`](file:///C:/Califnco/mobile/src/services/firebase.ts):
   ```typescript
   import { connectFunctionsEmulator } from 'firebase/functions';
   if (__DEV__) {
     // Use 10.0.2.2 for Android Studio emulator, or your local machine's LAN IP for physical device
     connectFunctionsEmulator(functions, '10.0.2.2', 5001);
   }
   ```
3. In [`mobile/src/services/orderService.ts`](file:///C:/Califnco/mobile/src/services/orderService.ts), set:
   ```typescript
   export const IS_BACKEND_DEPLOYED = true;
   ```
