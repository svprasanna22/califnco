import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './firebase';
import type { Order } from '../types/order';

const ORDERS_COLLECTION = 'orders';

export const BACKEND_API_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'https://califnco-backend.onrender.com';

export interface PlaceOrderAddress {
  street: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface PlaceOrderInput {
  items: Array<{ productId: string; quantity: number }>;
  shippingAddress: PlaceOrderAddress;
  customerInfo?: {
    name?: string;
    phone?: string;
  };
  orderType?: 'customer' | 'dealer';
}

export interface PlaceOrderResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  subtotal: number;
  tax: number;
  itemCount: number;
}

export interface CreateRazorpayOrderResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  isTestMode: boolean;
}

export interface VerifyPaymentInput {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  amount?: number;
  message?: string;
}

/**
 * Trusted Backend Availability Configuration:
 *
 * Current Firebase Plan: Spark (Free tier).
 * Cloud Functions deployment is disabled because Cloud Functions v2 requires the Blaze plan.
 *
 * To avoid unauthorized client writes or unverified orders, direct client-side
 * Firestore order creation is strictly disallowed.
 *
 * Once a trusted backend (Render Node.js backend or Firebase Cloud Functions on Blaze)
 * is deployed, toggle `IS_BACKEND_DEPLOYED` to `true`.
 */
export const IS_BACKEND_DEPLOYED = false;

/**
 * Creates a Razorpay Test Order via the secure Render backend.
 * Never computes or trusts amounts supplied by the mobile client.
 */
export async function createRazorpayOrderBackend(
  input: PlaceOrderInput
): Promise<CreateRazorpayOrderResult> {
  if (!IS_BACKEND_DEPLOYED) {
    throw new Error('Checkout is not available yet. No order has been placed.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to place an order.');
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch(`${BACKEND_API_BASE_URL}/api/payments/create-razorpay-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      items: input.items,
      shippingAddress: input.shippingAddress,
      customerInfo: input.customerInfo,
      orderType: input.orderType || 'customer',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to initialize Razorpay test payment.');
  }

  return data;
}

/**
 * Cryptographically verifies Razorpay payment on the secure Render backend.
 * Never marks orders paid based on client checkout callbacks alone.
 */
export async function verifyRazorpayPaymentBackend(
  data: VerifyPaymentInput
): Promise<VerifyPaymentResult> {
  if (!IS_BACKEND_DEPLOYED) {
    throw new Error('Checkout is not available yet. No order has been placed.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to verify your payment.');
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch(`${BACKEND_API_BASE_URL}/api/payments/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  });

  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData?.error || 'Payment signature verification failed.');
  }

  return resData;
}

/**
 * Reports a payment failure or cancellation to the backend safely
 */
export async function reportPaymentFailureBackend(
  orderId: string,
  razorpayOrderId?: string,
  errorDescription?: string
): Promise<void> {
  if (!IS_BACKEND_DEPLOYED) return;

  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const idToken = await currentUser.getIdToken();
    await fetch(`${BACKEND_API_BASE_URL}/api/payments/report-failure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        orderId,
        razorpayOrderId,
        errorDescription,
      }),
    });
  } catch (err) {
    console.error('Failed to report payment failure to backend:', err);
  }
}

/**
 * Places an order via the trusted Firebase Cloud Functions backend ('createOrder').
 *
 * Security & Integrity Guarantees:
 * - Does NOT perform direct Firestore order writes from the client.
 * - Server validates stock atomically in a transaction and calculates authoritative pricing.
 * - Enforces Cash on Delivery with pending status.
 * - If backend is not deployed or unreachable, fails gracefully with:
 *   "Checkout is not available yet. No order has been placed."
 */
export async function submitOrderToBackend(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  // Graceful guard when operating on the Firebase Spark free plan
  if (!IS_BACKEND_DEPLOYED) {
    throw new Error('Checkout is not available yet. No order has been placed.');
  }

  const createOrderCallable = httpsCallable<any, PlaceOrderResult>(functions, 'createOrder');

  try {
    const response = await createOrderCallable({
      items: input.items,
      shippingAddress: input.shippingAddress,
      customerInfo: input.customerInfo,
      paymentMethod: 'cash_on_delivery',
      orderType: input.orderType || 'customer',
    });
    return response.data;
  } catch (error: any) {
    console.error('Error invoking createOrder Cloud Function:', error);
    const code = error?.code;
    const rawMessage = error?.message || '';

    if (code === 'functions/unauthenticated' || code === 'unauthenticated') {
      throw new Error('Please sign in to your Califnco account to place an order.');
    }
    if (code === 'functions/failed-precondition' || code === 'failed-precondition') {
      throw new Error(`Inventory check failed: ${rawMessage}`);
    }
    if (code === 'functions/invalid-argument' || code === 'invalid-argument') {
      throw new Error(`Order details error: ${rawMessage}`);
    }

    // If Cloud Functions are not deployed (HTTP 404), unavailable, internal error, or network failure:
    if (
      code === 'functions/not-found' ||
      code === 'not-found' ||
      code === 'functions/unavailable' ||
      code === 'unavailable' ||
      code === 'functions/internal' ||
      code === 'internal' ||
      rawMessage.includes('NOT_FOUND') ||
      rawMessage.includes('network')
    ) {
      throw new Error('Checkout is not available yet. No order has been placed.');
    }

    throw new Error(rawMessage || 'Checkout is not available yet. No order has been placed.');
  }
}

/**
 * Fetches only the authenticated customer's own orders from Cloud Firestore.
 * Strictly filters by customer.uid == customerUid.
 */
export async function fetchCustomerOrders(customerUid: string): Promise<Order[]> {
  if (!customerUid) {
    return [];
  }

  try {
    const ordersRef = collection(db, ORDERS_COLLECTION);
    const q = query(
      ordersRef,
      where('customer.uid', '==', customerUid),
      orderBy('createdAt', 'desc')
    );

    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));
    } catch {
      // Fallback query without orderBy in case composite index (customer.uid + createdAt) is building
      const fallbackQuery = query(ordersRef, where('customer.uid', '==', customerUid));
      const fallbackSnapshot = await getDocs(fallbackQuery);
      const orders = fallbackSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));
      // In-memory sort by createdAt
      return orders.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    }
  } catch (error: unknown) {
    console.error(`Error fetching customer orders for UID ${customerUid}:`, error);
    throw new Error(getFriendlyOrdersErrorMessage(error));
  }
}

function getFriendlyOrdersErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  switch (err?.code) {
    case 'permission-denied':
      return 'Unable to retrieve orders: Customer order access requires updated Firestore security rules, or no orders have been recorded under this account.';
    case 'unavailable':
      return 'Cloud Firestore is currently unreachable. Please check your internet connection.';
    default:
      return err?.message || 'Failed to fetch customer orders from Cloud Firestore.';
  }
}
