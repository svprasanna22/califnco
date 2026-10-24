import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  type Timestamp,
  type FieldValue,
} from 'firebase/firestore';
import { db } from './firebase';
import { fetchProducts } from './productService';

export type OrderFulfillmentStatus =
  | 'pending'
  | 'processing'
  | 'dispatched'
  | 'out_for_installation'
  | 'installed'
  | 'cancelled';

export type OrderPaymentStatus =
  | 'pending'
  | 'paid'
  | 'cash_on_delivery'
  | 'failed'
  | 'refunded';

export type PaymentMethod =
  | 'razorpay'
  | 'stripe'
  | 'upi'
  | 'net_banking'
  | 'cash_on_delivery';

export interface OrderLineItem {
  productId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  total: number;
  imageUrl?: string;
}

export interface OrderCustomer {
  uid?: string;
  name: string;
  email: string;
  phone: string;
}

export interface OrderShippingAddress {
  street: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderPaymentInfo {
  status: OrderPaymentStatus;
  method: PaymentMethod;
  transactionId: string | null;
  paidAt?: Timestamp | FieldValue | Date | null;
  collectedByTechnician?: boolean;
  collectedAmount?: number;
  collectedAt?: Timestamp | FieldValue | Date | null;
  notes?: string;
  isTestMode?: boolean;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
}

export interface OrderFulfillmentInfo {
  status: OrderFulfillmentStatus;
  carrier?: string | null;
  trackingNumber?: string | null;
  assignedTechnician?: {
    id?: string;
    name: string;
    phone: string;
  } | null;
  installedAt?: Timestamp | FieldValue | Date | null;
  tdsReading?: number | null;
  installationNotes?: string | null;
  cancellationReason?: string | null;
  notes?: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  isTestOrder?: boolean;
  customer: OrderCustomer;
  shippingAddress: OrderShippingAddress;
  items: OrderLineItem[];
  pricing: {
    subtotal: number;
    tax: number;
    shipping: number;
    totalAmount: number;
  };
  payment: OrderPaymentInfo;
  fulfillment: OrderFulfillmentInfo;
  createdAt?: Timestamp | FieldValue | Date | null;
  updatedAt?: Timestamp | FieldValue | Date | null;
  updatedBy?: string;
}

const ORDERS_COLLECTION = 'orders';

/**
 * Valid state transitions for water purifier order fulfillment
 */
export const ALLOWED_FULFILLMENT_TRANSITIONS: Record<OrderFulfillmentStatus, OrderFulfillmentStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['dispatched', 'cancelled'],
  dispatched: ['out_for_installation', 'cancelled'],
  out_for_installation: ['installed', 'cancelled'],
  installed: [], // Terminal state
  cancelled: [], // Terminal state
};

/**
 * Validates whether a fulfillment transition is allowed
 */
export function isFulfillmentTransitionAllowed(
  current: OrderFulfillmentStatus,
  target: OrderFulfillmentStatus
): boolean {
  if (current === target) return true;
  return ALLOWED_FULFILLMENT_TRANSITIONS[current]?.includes(target) ?? false;
}

/**
 * Fetches all orders from Cloud Firestore ordered by creation date
 */
export async function fetchOrders(): Promise<Order[]> {
  try {
    const ordersRef = collection(db, ORDERS_COLLECTION);
    const q = query(ordersRef, orderBy('createdAt', 'desc'));

    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));
    } catch {
      // Fallback query if index is building or createdAt missing
      const fallbackSnapshot = await getDocs(ordersRef);
      return fallbackSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));
    }
  } catch (error: unknown) {
    console.error('Error fetching orders from Firestore:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Fetches a single order by ID
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  try {
    const docRef = doc(db, ORDERS_COLLECTION, orderId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<Order, 'id'>),
    };
  } catch (error: unknown) {
    console.error(`Error fetching order ${orderId}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

export interface FulfillmentUpdateParams {
  targetStatus: OrderFulfillmentStatus;
  carrier?: string;
  trackingNumber?: string;
  technicianName?: string;
  technicianPhone?: string;
  tdsReading?: number;
  installationNotes?: string;
  cancellationReason?: string;
  generalNotes?: string;
}

/**
 * Updates order fulfillment status with validation rules
 */
export async function updateOrderFulfillment(
  order: Order,
  params: FulfillmentUpdateParams,
  adminUid: string
): Promise<void> {
  const currentStatus = order.fulfillment.status;
  const targetStatus = params.targetStatus;

  // 1. Validate state transition
  if (!isFulfillmentTransitionAllowed(currentStatus, targetStatus)) {
    throw new Error(
      `Invalid fulfillment transition: cannot change status from "${currentStatus}" to "${targetStatus}".`
    );
  }

  // 2. Cancellation validation: must provide non-empty reason
  if (targetStatus === 'cancelled') {
    if (!params.cancellationReason || params.cancellationReason.trim().length < 5) {
      throw new Error('A cancellation reason of at least 5 characters is required to cancel an order.');
    }
  }

  // 3. Installation validation: must provide TDS verification reading and installation notes
  if (targetStatus === 'installed') {
    if (params.tdsReading === undefined || isNaN(params.tdsReading) || params.tdsReading <= 0) {
      throw new Error('A calibrated TDS reading (ppm > 0) is required to certify water purifier installation.');
    }
    if (!params.installationNotes || params.installationNotes.trim().length < 5) {
      throw new Error('Installation and water quality handover notes (minimum 5 characters) are required.');
    }
  }

  // 4. Out for installation validation: technician details recommended
  if (targetStatus === 'out_for_installation') {
    if (!params.technicianName?.trim()) {
      throw new Error('An assigned technician name is required when dispatching for installation.');
    }
  }

  try {
    const orderDocRef = doc(db, ORDERS_COLLECTION, order.id);
    const updatedFulfillment: OrderFulfillmentInfo = {
      ...order.fulfillment,
      status: targetStatus,
    };

    if (params.carrier !== undefined) updatedFulfillment.carrier = params.carrier.trim();
    if (params.trackingNumber !== undefined) updatedFulfillment.trackingNumber = params.trackingNumber.trim();
    if (params.generalNotes !== undefined) updatedFulfillment.notes = params.generalNotes.trim();

    if (params.technicianName?.trim()) {
      updatedFulfillment.assignedTechnician = {
        name: params.technicianName.trim(),
        phone: params.technicianPhone?.trim() || '',
      };
    }

    if (targetStatus === 'installed') {
      updatedFulfillment.installedAt = serverTimestamp();
      updatedFulfillment.tdsReading = Number(params.tdsReading);
      updatedFulfillment.installationNotes = params.installationNotes?.trim() || '';
    }

    if (targetStatus === 'cancelled') {
      updatedFulfillment.cancellationReason = params.cancellationReason?.trim() || '';
    }

    await updateDoc(orderDocRef, {
      fulfillment: updatedFulfillment,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  } catch (error: unknown) {
    console.error(`Error updating order fulfillment ${order.id}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Records Cash on Delivery (COD) collection by the field technician.
 *
 * Security Guarantee:
 * - This function does NOT fabricate external gateway transaction IDs.
 * - Only records field cash collection with technician attribution.
 * - Gateway payments (Razorpay/Stripe) are immutable in client code and require server webhook verification.
 */
export async function recordCODCollection(
  order: Order,
  collectedAmount: number,
  notes: string,
  adminUid: string
): Promise<void> {
  if (order.payment.method !== 'cash_on_delivery') {
    throw new Error('Manual collection can only be recorded for Cash on Delivery orders.');
  }

  if (isNaN(collectedAmount) || collectedAmount <= 0) {
    throw new Error('Please enter a valid positive collected amount.');
  }

  try {
    const orderDocRef = doc(db, ORDERS_COLLECTION, order.id);
    const updatedPayment: OrderPaymentInfo = {
      ...order.payment,
      status: 'paid',
      collectedByTechnician: true,
      collectedAmount: Number(collectedAmount),
      collectedAt: serverTimestamp(),
      notes: notes.trim() || 'Cash on Delivery collected and verified by field installation team.',
    };

    await updateDoc(orderDocRef, {
      payment: updatedPayment,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  } catch (error: unknown) {
    console.error(`Error recording COD collection for order ${order.id}:`, error);
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
      return 'The requested order was not found.';
    default:
      return err?.message || 'Failed to perform order operation in Cloud Firestore.';
  }
}

/**
 * Creates one clearly marked live TEST order using an actual product from Cloud Firestore.
 *
 * Security & Accuracy Guarantees:
 * - Reads authoritative product prices from Firestore (no arbitrary prices).
 * - Generates a dynamic unique test order number (e.g. TEST-ORD-XXXX-XXXX).
 * - Fictional customer, address, and technician data.
 * - Cash on Delivery with pending status (zero fake online payment claims).
 * - Sets isTestOrder: true for restricted cleanup.
 */
export async function createAdminTestOrder(adminUid: string): Promise<string> {
  const products = await fetchProducts();
  if (products.length === 0) {
    throw new Error(
      'No products found in Firestore catalog. Please create at least one product in Product Management before generating a test order.'
    );
  }

  // Select first available product from Firestore
  const product = products[0];
  const subtotal = Number(product.price);
  const tax = Math.round(subtotal * 0.18);
  const totalAmount = subtotal + tax;

  const uniqueSuffix = `${Date.now().toString().slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const orderNumber = `TEST-ORD-${uniqueSuffix}`;

  const testOrderData = {
    orderNumber,
    isTestOrder: true,
    customer: {
      name: 'QA Test Customer (Do Not Ship)',
      email: `qa-test-${Date.now()}@califnco.internal`,
      phone: '+91 99999 00000 (Fictional)',
      uid: adminUid,
    },
    shippingAddress: {
      street: 'Plot 99, Fictional Testing Sector, Sandbox QA Zone',
      landmark: 'Near Virtual Test Lab',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    },
    items: [
      {
        productId: product.id,
        name: product.name,
        category: product.category,
        price: subtotal,
        quantity: 1,
        total: subtotal,
        imageUrl: product.imageUrl || '',
      },
    ],
    pricing: {
      subtotal,
      tax,
      shipping: 0,
      totalAmount,
    },
    payment: {
      method: 'cash_on_delivery' as PaymentMethod,
      status: 'pending' as OrderPaymentStatus,
      transactionId: null,
      collectedByTechnician: false,
    },
    fulfillment: {
      status: 'pending' as OrderFulfillmentStatus,
      notes: 'Fictional test order generated for admin QA verification.',
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: adminUid,
    updatedBy: adminUid,
  };

  try {
    const ordersRef = collection(db, ORDERS_COLLECTION);
    const docRef = await addDoc(ordersRef, testOrderData);
    return docRef.id;
  } catch (error: unknown) {
    console.error('Error creating admin test order in Firestore:', error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

/**
 * Deletes a test order from Firestore.
 *
 * Safety Restriction:
 * Strictly enforces order.isTestOrder === true. It will NEVER delete real customer orders.
 */
export async function removeTestOrder(order: Order): Promise<void> {
  if (order.isTestOrder !== true) {
    throw new Error(
      'Security Restriction: The test cleanup action can only delete documents verified to have isTestOrder === true.'
    );
  }

  try {
    const docRef = doc(db, ORDERS_COLLECTION, order.id);
    await deleteDoc(docRef);
  } catch (error: unknown) {
    console.error(`Error deleting test order ${order.id}:`, error);
    throw new Error(getFriendlyFirestoreErrorMessage(error));
  }
}

