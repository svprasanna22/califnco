import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
  query,
  orderBy,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { DEMO_50_PRODUCTS } from './demoProductsData';

export type ProductCategory =
  | 'ro-purifiers'
  | 'uv-uf-purifiers'
  | 'cartridges'
  | 'spare-parts';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: ProductCategory;
  stock: number;
  imageUrl: string;
  isDemo?: boolean;
  imageType?: string;
  badge?: string;
  rating?: number;
  reviewCount?: number;
  features?: string[];
  specifications?: Record<string, string>;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
  createdBy?: string;
  updatedBy?: string;
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  category: ProductCategory;
  stock: number;
  imageUrl: string;
  isDemo?: boolean;
  imageType?: string;
  badge?: string;
}

const PRODUCTS_COLLECTION = 'products';

/**
 * Fetches all products from Cloud Firestore
 */
export async function fetchProducts(): Promise<Product[]> {
  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    // Query ordered by creation time
    const q = query(productsRef, orderBy('createdAt', 'desc'));
    
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Product, 'id'>),
      }));
    } catch {
      // Fallback without ordering in case index or createdAt field is not present on legacy docs
      const fallbackSnapshot = await getDocs(productsRef);
      return fallbackSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Product, 'id'>),
      }));
    }
  } catch (error: unknown) {
    console.error('Error fetching products from Firestore:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Creates a new product in Firestore
 */
export async function createProduct(input: ProductInput, adminUid: string): Promise<string> {
  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const docRef = await addDoc(productsRef, {
      name: input.name.trim(),
      description: input.description.trim(),
      price: Number(input.price),
      category: input.category,
      stock: Math.max(0, Math.floor(Number(input.stock))),
      imageUrl: input.imageUrl.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: adminUid,
      updatedBy: adminUid,
    });
    return docRef.id;
  } catch (error: unknown) {
    console.error('Error creating product in Firestore:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Updates an existing product in Firestore
 */
export async function updateProduct(
  id: string,
  input: Partial<ProductInput>,
  adminUid: string
): Promise<void> {
  try {
    const productDocRef = doc(db, PRODUCTS_COLLECTION, id);
    const updateData: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    };

    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description.trim();
    if (input.price !== undefined) updateData.price = Number(input.price);
    if (input.category !== undefined) updateData.category = input.category;
    if (input.stock !== undefined) updateData.stock = Math.max(0, Math.floor(Number(input.stock)));
    if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl.trim();

    await updateDoc(productDocRef, updateData);
  } catch (error: unknown) {
    console.error(`Error updating product ${id}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'invalid';

/**
 * Evaluates stock quantity against authoritative business thresholds:
 * - in_stock: stock > 5
 * - low_stock: 1 <= stock <= 5
 * - out_of_stock: stock === 0
 * - invalid: missing, null, undefined, negative, or NaN
 */
export function getStockStatus(stock: any): StockStatus {
  if (
    stock === null ||
    stock === undefined ||
    typeof stock !== 'number' ||
    isNaN(stock) ||
    !Number.isFinite(stock) ||
    stock < 0 ||
    !Number.isInteger(stock)
  ) {
    return 'invalid';
  }
  if (stock === 0) {
    return 'out_of_stock';
  }
  if (stock <= 5) {
    return 'low_stock';
  }
  return 'in_stock';
}

/**
 * Safely updates only the stock quantity of a product in Cloud Firestore.
 * Preserves all other product fields (name, price, imageUrl, description, etc.).
 * Strictly validates that newStock is a finite, non-negative integer.
 */
export async function updateProductStock(
  productId: string,
  newStock: number,
  adminUid: string
): Promise<void> {
  if (!Number.isInteger(newStock) || newStock < 0 || !Number.isFinite(newStock)) {
    throw new Error('Stock quantity must be a finite, non-negative integer (0 or greater).');
  }

  try {
    const productDocRef = doc(db, PRODUCTS_COLLECTION, productId);
    await updateDoc(productDocRef, {
      stock: newStock,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  } catch (error: unknown) {
    console.error(`Error updating stock for product ${productId}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Deletes a product from Firestore
 */
export async function removeProduct(id: string): Promise<void> {
  try {
    const productDocRef = doc(db, PRODUCTS_COLLECTION, id);
    await deleteDoc(productDocRef);
  } catch (error: unknown) {
    console.error(`Error deleting product ${id}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Converts Firestore errors into user-friendly messages
 */
export function getFriendlyFirestoreErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  switch (err?.code) {
    case 'permission-denied':
      return 'Access denied: Firestore security rules do not allow this operation. Ensure your account is an authorized administrator and the products security rules are configured in the Firebase Console.';
    case 'unavailable':
      return 'Cloud Firestore is currently unreachable. Please check your internet connectivity.';
    case 'deadline-exceeded':
      return 'The operation timed out. Please try again.';
    case 'not-found':
      return 'The requested product document was not found.';
    default:
      return err?.message || 'Failed to perform product operation in Cloud Firestore.';
  }
}

/**
 * Format currency in Indian Rupees (INR)
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface DemoSeedResult {
  created: number;
  skipped: number;
  total: number;
  message: string;
}

/**
 * Checks how many of the 50 demo products currently exist in Firestore
 */
export async function checkDemoProductsStatus(): Promise<{ existingCount: number; total: number }> {
  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const snap = await getDocs(productsRef);
    let count = 0;
    snap.forEach((d) => {
      if (d.id.startsWith('demo-prod-') || d.data()?.isDemo === true) {
        count++;
      }
    });
    return { existingCount: count, total: 50 };
  } catch (err) {
    console.warn('Could not check demo status:', err);
    return { existingCount: 0, total: 50 };
  }
}

/**
 * Seeds exactly 50 clearly labeled demo products into Cloud Firestore.
 * Requirements:
 * - Admin-only explicit trigger
 * - Uses batched writes
 * - Idempotent: Skips documents that already exist, preserving inventory
 * - Does NOT overwrite or touch real products
 */
export async function seed50DemoProducts(adminUid: string): Promise<DemoSeedResult> {
  try {
    let created = 0;
    let skipped = 0;

    // 1. Fetch existing products to ensure idempotency and prevent duplicate writes
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const existingSnap = await getDocs(productsRef);
    const existingIds = new Set<string>();
    existingSnap.forEach((d) => existingIds.add(d.id));

    // 2. Prepare batch write (Firestore allows up to 500 ops per batch; 50 is well within limits)
    const batch = writeBatch(db);
    const now = serverTimestamp();

    for (const item of DEMO_50_PRODUCTS) {
      if (existingIds.has(item.id)) {
        skipped++;
        continue;
      }

      const docRef = doc(db, PRODUCTS_COLLECTION, item.id);
      batch.set(docRef, {
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        stock: item.stock,
        imageUrl: item.imageUrl,
        isDemo: true,
        imageType: item.imageType,
        badge: item.badge || 'Demo Item',
        rating: item.rating,
        reviewCount: item.reviewCount,
        features: item.features,
        specifications: item.specifications,
        createdAt: now,
        updatedAt: now,
        createdBy: adminUid,
        updatedBy: adminUid,
      });
      created++;
    }

    if (created > 0) {
      await batch.commit();
    }

    const message =
      created > 0
        ? `Successfully seeded ${created} demo products into Firestore (${skipped} already existed).`
        : `All ${skipped} demo products already exist in Firestore. No records were modified.`;

    return { created, skipped, total: 50, message };
  } catch (error: unknown) {
    console.error('Error seeding demo products:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Safely removes only the 50 seeded demo products from Cloud Firestore.
 * Guarantees real products are never deleted.
 */
export async function cleanupDemoProducts(): Promise<{ deleted: number; message: string }> {
  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const snap = await getDocs(productsRef);
    const batch = writeBatch(db);
    let deleted = 0;

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      // Strict safety check: only delete if ID starts with demo-prod- AND isDemo === true
      if (docSnap.id.startsWith('demo-prod-') && data?.isDemo === true) {
        batch.delete(docSnap.ref);
        deleted++;
      }
    });

    if (deleted > 0) {
      await batch.commit();
    }

    return {
      deleted,
      message:
        deleted > 0
          ? `Removed ${deleted} demo products from Firestore. Real products were preserved.`
          : 'No demo products found to remove.',
    };
  } catch (error: unknown) {
    console.error('Error cleaning up demo products:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

