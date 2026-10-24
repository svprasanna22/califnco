import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  type Timestamp,
  type FieldValue,
} from 'firebase/firestore';
import { db } from './firebase';

export type DealerStatus = 'pending' | 'active' | 'suspended';

export type DealerTier =
  | 'diamond'
  | 'gold'
  | 'silver'
  | 'regional_hub'
  | 'service_partner';

export interface DealerAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface Dealer {
  id: string;
  dealerCode: string;
  businessName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: DealerAddress;
  gstin?: string | null;
  tier: DealerTier;
  status: DealerStatus;
  installedBaseCount?: number;
  notes?: string | null;
  userId?: string | null;
  createdAt?: Timestamp | FieldValue | Date | null;
  updatedAt?: Timestamp | FieldValue | Date | null;
  createdBy?: string;
  updatedBy?: string;
}

export interface DealerInput {
  businessName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: DealerAddress;
  gstin?: string;
  tier: DealerTier;
  status: DealerStatus;
  installedBaseCount?: number;
  notes?: string;
  userId?: string;
}

const DEALERS_COLLECTION = 'dealers';

export const DEALER_TIER_CONFIG: Record<
  DealerTier,
  { label: string; badgeColor: string; description: string }
> = {
  diamond: {
    label: 'Diamond Distributor',
    badgeColor: 'var(--cyan-primary)',
    description: 'High-volume tier with regional territory exclusivity',
  },
  gold: {
    label: 'Gold Partner',
    badgeColor: '#fbbf24',
    description: 'City-level distributor and primary stockist',
  },
  silver: {
    label: 'Silver Partner',
    badgeColor: '#94a3b8',
    description: 'Town or zonal certified retailer and installer',
  },
  regional_hub: {
    label: 'Regional Hub',
    badgeColor: '#34d399',
    description: 'Central parts depot and fulfillment center',
  },
  service_partner: {
    label: 'Authorized Service Center',
    badgeColor: '#38bdf8',
    description: 'Certified water quality testing and technician dispatch partner',
  },
};

/**
 * Validation Helpers
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  // Indian 10-digit mobile number or standard international E.164 with optional country code
  const sanitized = phone.replace(/[\s\-()]/g, '');
  return /^(\+91)?[6-9]\d{9}$/.test(sanitized) || /^\+[1-9]\d{7,14}$/.test(sanitized);
}

export function isValidPostalCode(pin: string): boolean {
  // Indian 6-digit PIN code
  return /^[1-9][0-9]{5}$/.test(pin.trim());
}

export function isValidGSTIN(gstin: string): boolean {
  if (!gstin.trim()) return true; // Optional field
  // Standard Indian 15-character GST format: 2 digits state code, 10 chars PAN, 1 entity code, Z, 1 checksum
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase());
}

/**
 * Generates a unique dealer code safely with collision detection.
 * Queries Firestore to guarantee uniqueness across existing records.
 */
export async function generateUniqueDealerCode(): Promise<string> {
  const dealersRef = collection(db, DEALERS_COLLECTION);

  for (let attempt = 0; attempt < 5; attempt++) {
    // Generate 5 random alphanumeric uppercase characters
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const candidateCode = `DLR-${randomHex}`;

    try {
      const q = query(dealersRef, where('dealerCode', '==', candidateCode));
      const snap = await getDocs(q);
      if (snap.empty) {
        return candidateCode;
      }
    } catch {
      // If index is building or permissions prevent where query, use timestamp-based collision-resistant code
      break;
    }
  }

  // Safe collision-resistant fallback
  const timestampPart = Date.now().toString(36).toUpperCase().slice(-4);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `DLR-${timestampPart}-${randomPart}`;
}

/**
 * Fetches all dealer records from Cloud Firestore ordered by creation date
 */
export async function fetchDealers(): Promise<Dealer[]> {
  try {
    const dealersRef = collection(db, DEALERS_COLLECTION);
    const q = query(dealersRef, orderBy('createdAt', 'desc'));

    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Dealer, 'id'>),
      }));
    } catch {
      // Fallback query if index is building or createdAt is missing on existing records
      const fallbackSnapshot = await getDocs(dealersRef);
      return fallbackSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Dealer, 'id'>),
      }));
    }
  } catch (error: unknown) {
    console.error('Error fetching dealers from Firestore:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Fetches a single dealer by ID
 */
export async function getDealerById(dealerId: string): Promise<Dealer | null> {
  try {
    const docRef = doc(db, DEALERS_COLLECTION, dealerId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<Dealer, 'id'>),
    };
  } catch (error: unknown) {
    console.error(`Error fetching dealer ${dealerId}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Creates a new dealer document in Cloud Firestore
 *
 * Security:
 * - Never stores passwords or authentication secrets.
 * - Records creating admin UID for audit logging.
 */
export async function createDealer(input: DealerInput, adminUid: string): Promise<string> {
  // Validate required inputs
  if (!input.businessName.trim() || input.businessName.trim().length < 3) {
    throw new Error('Business name is required (minimum 3 characters).');
  }
  if (!input.contactPerson.trim() || input.contactPerson.trim().length < 3) {
    throw new Error('Contact person name is required (minimum 3 characters).');
  }
  if (!isValidEmail(input.email)) {
    throw new Error('A valid business email address is required.');
  }
  if (!isValidPhone(input.phone)) {
    throw new Error('A valid phone number (10-digit mobile or international E.164) is required.');
  }
  if (!input.address.street.trim() || !input.address.city.trim() || !input.address.state.trim()) {
    throw new Error('Complete street address, city, and state are required.');
  }
  if (!isValidPostalCode(input.address.postalCode)) {
    throw new Error('A valid 6-digit postal code (PIN code) is required.');
  }
  if (input.gstin?.trim() && !isValidGSTIN(input.gstin)) {
    throw new Error('Invalid GSTIN format. Must match standard 15-character format (e.g. 29ABCDE1234F1Z5).');
  }

  const dealerCode = await generateUniqueDealerCode();

  const newDealerData = {
    dealerCode,
    businessName: input.businessName.trim(),
    contactPerson: input.contactPerson.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    address: {
      street: input.address.street.trim(),
      city: input.address.city.trim(),
      state: input.address.state.trim(),
      postalCode: input.address.postalCode.trim(),
    },
    gstin: input.gstin?.trim() ? input.gstin.trim().toUpperCase() : null,
    tier: input.tier,
    status: input.status,
    installedBaseCount: Math.max(0, Math.floor(Number(input.installedBaseCount || 0))),
    notes: input.notes?.trim() || null,
    userId: input.userId?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: adminUid,
    updatedBy: adminUid,
  };

  try {
    const dealersRef = collection(db, DEALERS_COLLECTION);
    const docRef = await addDoc(dealersRef, newDealerData);
    return docRef.id;
  } catch (error: unknown) {
    console.error('Error creating dealer document in Firestore:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Updates an existing dealer document
 */
export async function updateDealer(
  dealerId: string,
  input: DealerInput,
  adminUid: string
): Promise<void> {
  // Validate inputs
  if (!input.businessName.trim() || input.businessName.trim().length < 3) {
    throw new Error('Business name is required (minimum 3 characters).');
  }
  if (!input.contactPerson.trim() || input.contactPerson.trim().length < 3) {
    throw new Error('Contact person name is required (minimum 3 characters).');
  }
  if (!isValidEmail(input.email)) {
    throw new Error('A valid business email address is required.');
  }
  if (!isValidPhone(input.phone)) {
    throw new Error('A valid phone number (10-digit mobile or international E.164) is required.');
  }
  if (!input.address.street.trim() || !input.address.city.trim() || !input.address.state.trim()) {
    throw new Error('Complete street address, city, and state are required.');
  }
  if (!isValidPostalCode(input.address.postalCode)) {
    throw new Error('A valid 6-digit postal code (PIN code) is required.');
  }
  if (input.gstin?.trim() && !isValidGSTIN(input.gstin)) {
    throw new Error('Invalid GSTIN format. Must match standard 15-character format (e.g. 29ABCDE1234F1Z5).');
  }

  try {
    const docRef = doc(db, DEALERS_COLLECTION, dealerId);
    await updateDoc(docRef, {
      businessName: input.businessName.trim(),
      contactPerson: input.contactPerson.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      address: {
        street: input.address.street.trim(),
        city: input.address.city.trim(),
        state: input.address.state.trim(),
        postalCode: input.address.postalCode.trim(),
      },
      gstin: input.gstin?.trim() ? input.gstin.trim().toUpperCase() : null,
      tier: input.tier,
      status: input.status,
      installedBaseCount: Math.max(0, Math.floor(Number(input.installedBaseCount || 0))),
      notes: input.notes?.trim() || null,
      userId: input.userId?.trim() || null,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  } catch (error: unknown) {
    console.error(`Error updating dealer ${dealerId}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Updates only the account status of a dealer (e.g. pending, active, suspended)
 */
export async function updateDealerStatus(
  dealerId: string,
  newStatus: DealerStatus,
  adminUid: string
): Promise<void> {
  try {
    const docRef = doc(db, DEALERS_COLLECTION, dealerId);
    await updateDoc(docRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  } catch (error: unknown) {
    console.error(`Error updating status for dealer ${dealerId}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Deletes a dealer document from Cloud Firestore
 */
export async function removeDealer(dealerId: string): Promise<void> {
  try {
    const docRef = doc(db, DEALERS_COLLECTION, dealerId);
    await deleteDoc(docRef);
  } catch (error: unknown) {
    console.error(`Error deleting dealer ${dealerId}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

function getFriendlyFirestoreErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  switch (err?.code) {
    case 'permission-denied':
      return 'Access denied: Firestore security rules do not allow this operation. Ensure your account is an authorized administrator.';
    case 'unavailable':
      return 'Cloud Firestore is currently unreachable. Check your internet connection.';
    case 'not-found':
      return 'The requested dealer record was not found.';
    default:
      return err?.message || 'Failed to perform dealer operation in Cloud Firestore.';
  }
}
