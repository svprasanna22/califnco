import fs from 'fs';
import { initializeApp } from '../admin/node_modules/firebase/app/dist/index.mjs';
import { getFirestore, collection, getDocs } from '../admin/node_modules/firebase/firestore/dist/index.mjs';

const envContent = fs.readFileSync('admin/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.trim().split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  try {
    const snap = await getDocs(collection(db, 'products'));
    console.log(`Successfully connected to Firestore!`);
    console.log(`Total documents in 'products' collection: ${snap.size}`);
    
    let demoCount = 0;
    let realCount = 0;
    snap.forEach(doc => {
      const data = doc.data();
      if (doc.id.startsWith('demo-prod-') || data.isDemo) {
        demoCount++;
      } else {
        realCount++;
        console.log(`Real product: ${doc.id} - ${data.name} (Rs ${data.price})`);
      }
    });
    console.log(`Summary: Real products: ${realCount}, Demo products: ${demoCount}`);
  } catch (err) {
    console.error('Error querying Firestore:', err.message);
  }
}

check();
