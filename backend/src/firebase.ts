import admin from 'firebase-admin';
import { config } from './config';

if (admin.apps.length === 0) {
  if (config.firebaseClientEmail && config.firebasePrivateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebaseProjectId,
        clientEmail: config.firebaseClientEmail,
        privateKey: config.firebasePrivateKey,
      }),
    });
  } else {
    // Falls back to Google Application Default Credentials or Project ID
    admin.initializeApp({
      projectId: config.firebaseProjectId,
    });
  }
}

export const firebaseAdmin = admin;
export const auth = admin.auth();
export const db = admin.firestore();
export { FieldValue } from 'firebase-admin/firestore';
