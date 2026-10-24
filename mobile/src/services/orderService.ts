import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, auth } from './firebase';
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
 * Backend availability flag. Active with Render Node.js backend.
 */
export const IS_BACKEND_DEPLOYED = true;

/**
 * Robust network fetch helper with diagnostic errors
 */
async function safeBackendFetch(url: string, options: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (netErr: any) {
    console.error(`Network fetch failed for ${url}:`, netErr);
    throw new Error(
      `Unable to reach Califnco backend server (${BACKEND_API_BASE_URL}). If using Render free tier, the server may be waking from sleep (please retry in 30 seconds).`
    );
  }

  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Server returned HTTP ${response.status}: ${text.slice(0, 150)}`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return data;
}

/**
 * Creates a Razorpay Test Order via the secure Render backend.
 * Never computes or trusts amounts supplied by the mobile client.
 */
export async function createRazorpayOrderBackend(
  input: PlaceOrderInput
): Promise<CreateRazorpayOrderResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to your Califnco account to place an order.');
  }

  const idToken = await currentUser.getIdToken();

  return await safeBackendFetch(`${BACKEND_API_BASE_URL}/api/payments/create-razorpay-order`, {
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
}

/**
 * Cryptographically verifies Razorpay payment on the secure Render backend.
 * Never marks orders paid based on client checkout callbacks alone.
 */
export async function verifyRazorpayPaymentBackend(
  data: VerifyPaymentInput
): Promise<VerifyPaymentResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to verify your payment.');
  }

  const idToken = await currentUser.getIdToken();

  return await safeBackendFetch(`${BACKEND_API_BASE_URL}/api/payments/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  });
}

/**
 * Reports a payment failure or cancellation to the backend safely
 */
export async function reportPaymentFailureBackend(
  orderId: string,
  razorpayOrderId?: string,
  errorDescription?: string
): Promise<void> {
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
 * Places a Cash on Delivery order via the secure Render backend.
 *
 * Security & Accuracy Guarantees:
 * - Does NOT perform direct Firestore order writes from the client.
 * - Server validates stock atomically in a transaction and calculates authoritative pricing.
 * - Enforces Cash on Delivery with pending status and reserves inventory.
 */
export async function submitOrderToBackend(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to your Califnco account to place an order.');
  }

  const idToken = await currentUser.getIdToken();

  return await safeBackendFetch(`${BACKEND_API_BASE_URL}/api/payments/create-cod-order`, {
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
