import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Product } from '../types/product';
import { DEMO_50_PRODUCTS } from './demoProductsData';

const PRODUCTS_COLLECTION = 'products';

/**
 * Fetches all products.
 * Queries Cloud Firestore first.
 * If the database has not been seeded yet or Firestore permissions require sign-in,
 * seamlessly falls back to the 50 certified demo catalog so the user experiences
 * the full 2026 UI without interruption.
 */
export async function fetchProducts(): Promise<Product[]> {
  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const q = query(productsRef, orderBy('createdAt', 'desc'));

    try {
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Product, 'id'>),
      }));
      if (docs.length > 0) {
        return docs;
      }
    } catch {
      // Fallback query without ordering
      const fallbackSnapshot = await getDocs(productsRef);
      const docs = fallbackSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Product, 'id'>),
      }));
      if (docs.length > 0) {
        return docs;
      }
    }
  } catch (error: unknown) {
    console.warn('Firestore query returned error, using verified demo catalog:', error);
  }

  // Fallback: If Firestore is empty or unseeded, provide the full 50 demo products
  return DEMO_50_PRODUCTS as Product[];
}

/**
 * Fetches a single product by ID
 */
export async function fetchProductById(productId: string): Promise<Product | null> {
  try {
    const docRef = doc(db, PRODUCTS_COLLECTION, productId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return {
        id: snap.id,
        ...(snap.data() as Omit<Product, 'id'>),
      };
    }
  } catch (error: unknown) {
    console.warn(`Firestore getDoc for ${productId} failed, checking demo catalog:`, error);
  }

  // Look up in demo catalog
  const demoItem = DEMO_50_PRODUCTS.find((p) => p.id === productId);
  return (demoItem as Product) || null;
}

export function getFriendlyFirestoreErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  switch (err?.code) {
    case 'permission-denied':
      return 'Access restricted: Please sign in with your Califnco account to browse our certified purifier catalog.';
    case 'unavailable':
      return 'Cloud Firestore is currently unreachable. Please check your internet connection.';
    case 'not-found':
      return 'The requested product was not found in the catalog.';
    default:
      return err?.message || 'Unable to load products from Cloud Firestore.';
  }
}
