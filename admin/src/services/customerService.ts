import { fetchOrders, type Order } from './orderService';
import { formatINR } from './productService';

export interface CustomerShippingSummary {
  street?: string;
  landmark?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CustomerRecord {
  uid: string; // Normalized non-empty UID (Primary Key)
  name: string; // Best available customer display name
  email: string; // Best available email
  phone: string; // Best available phone number
  totalOrders: number; // Total orders linked to this UID
  verifiedSpending: number; // Verified revenue sum (excluding cancelled, failed, uncollected COD, refunded)
  verifiedOrdersCount: number; // Number of orders that contributed to verified spending
  firstOrderDate: Date | null; // Earliest recorded order date
  lastOrderDate: Date | null; // Most recent recorded order date
  shippingAddresses: CustomerShippingSummary[]; // Unique shipping addresses
  orders: Order[]; // All orders for this customer, sorted newest first
}

/**
 * Determines whether an order has confirmed, verified payment.
 * Security & Accounting Rules (Consistent with Live Operations Dashboard):
 * 1. Exclude cancelled orders completely (fulfillment.status === 'cancelled').
 * 2. Exclude failed ('failed'), pending ('pending'), and refunded ('refunded') payments.
 * 3. For Cash on Delivery (method === 'cash_on_delivery'):
 *    Count ONLY if payment status is 'paid' OR collectedByTechnician is true.
 *    Use collectedAmount (if > 0), falling back to totalAmount.
 * 4. For Online Gateways (Razorpay/Stripe/UPI/Net Banking):
 *    Count ONLY if payment status is explicitly 'paid'.
 * 5. Returns exact verified amount and audit reason.
 */
export function isOrderVerifiedPaid(order: Order): {
  isVerified: boolean;
  amount: number;
  reason: string;
} {
  if (order.fulfillment?.status === 'cancelled') {
    return { isVerified: false, amount: 0, reason: 'Order cancelled' };
  }

  const payment = order.payment;
  if (!payment) {
    return { isVerified: false, amount: 0, reason: 'Missing payment record' };
  }

  if (payment.status === 'failed') {
    return { isVerified: false, amount: 0, reason: 'Payment failed' };
  }
  if (payment.status === 'pending') {
    return { isVerified: false, amount: 0, reason: 'Payment pending gateway confirmation' };
  }
  if (payment.status === 'refunded') {
    return { isVerified: false, amount: 0, reason: 'Payment refunded' };
  }

  if (payment.method === 'cash_on_delivery') {
    if (payment.status === 'paid' || payment.collectedByTechnician === true) {
      const amount =
        typeof payment.collectedAmount === 'number' && payment.collectedAmount > 0
          ? payment.collectedAmount
          : Number(order.pricing?.totalAmount) || 0;
      return { isVerified: true, amount, reason: 'Confirmed COD collection' };
    }
    return { isVerified: false, amount: 0, reason: 'COD awaiting technician collection' };
  }

  if (payment.status === 'paid') {
    const amount = Number(order.pricing?.totalAmount) || 0;
    return { isVerified: true, amount, reason: 'Verified gateway payment' };
  }

  return { isVerified: false, amount: 0, reason: 'Unverified payment status' };
}

/**
 * Safe helper to parse Firestore Timestamp / Date / string into a JS Date
 */
export function parseDate(dateVal: any): Date | null {
  if (!dateVal) return null;
  try {
    if (typeof dateVal.toDate === 'function') return dateVal.toDate();
    if (dateVal instanceof Date) return dateVal;
    if (typeof dateVal.seconds === 'number') return new Date(dateVal.seconds * 1000);
    const parsed = new Date(dateVal);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {}
  return null;
}

/**
 * Aggregates and deduplicates customer records from raw Firestore order documents
 * using normalized, non-empty customer UIDs.
 */
export function aggregateCustomersFromOrders(orders: Order[]): CustomerRecord[] {
  const customerMap = new Map<
    string,
    {
      uid: string;
      names: Set<string>;
      emails: Set<string>;
      phones: Set<string>;
      orders: Order[];
      shippingMap: Map<string, CustomerShippingSummary>;
    }
  >();

  for (const order of orders) {
    const rawUid = order.customer?.uid;
    if (!rawUid || typeof rawUid !== 'string') continue;
    const uid = rawUid.trim();
    if (!uid) continue;

    let entry = customerMap.get(uid);
    if (!entry) {
      entry = {
        uid,
        names: new Set<string>(),
        emails: new Set<string>(),
        phones: new Set<string>(),
        orders: [],
        shippingMap: new Map<string, CustomerShippingSummary>(),
      };
      customerMap.set(uid, entry);
    }

    entry.orders.push(order);

    if (order.customer?.name && typeof order.customer.name === 'string' && order.customer.name.trim()) {
      entry.names.add(order.customer.name.trim());
    }
    if (order.customer?.email && typeof order.customer.email === 'string' && order.customer.email.trim()) {
      entry.emails.add(order.customer.email.trim());
    }
    if (order.customer?.phone && typeof order.customer.phone === 'string' && order.customer.phone.trim()) {
      entry.phones.add(order.customer.phone.trim());
    }

    if (order.shippingAddress) {
      const addr = order.shippingAddress;
      const addrKey = `${addr.street || ''}|${addr.city || ''}|${addr.state || ''}|${addr.postalCode || ''}`.toLowerCase();
      if (addrKey.replace(/\|/g, '').length > 0 && !entry.shippingMap.has(addrKey)) {
        entry.shippingMap.set(addrKey, {
          street: addr.street?.trim(),
          landmark: addr.landmark?.trim(),
          city: addr.city?.trim(),
          state: addr.state?.trim(),
          postalCode: addr.postalCode?.trim(),
          country: addr.country?.trim() || 'India',
        });
      }
    }
  }

  const customers: CustomerRecord[] = [];

  for (const entry of customerMap.values()) {
    // Sort orders descending by createdAt (newest first)
    entry.orders.sort((a, b) => {
      const dateA = parseDate(a.createdAt)?.getTime() || 0;
      const dateB = parseDate(b.createdAt)?.getTime() || 0;
      return dateB - dateA;
    });

    let totalSpending = 0;
    let verifiedCount = 0;

    for (const ord of entry.orders) {
      const { isVerified, amount } = isOrderVerifiedPaid(ord);
      if (isVerified) {
        totalSpending += amount;
        verifiedCount++;
      }
    }

    // Determine primary display name, email, phone from latest order
    const latestOrder = entry.orders[0];
    const latestName = latestOrder?.customer?.name?.trim();
    const primaryName = latestName || Array.from(entry.names)[0] || '';

    const latestEmail = latestOrder?.customer?.email?.trim();
    const primaryEmail = latestEmail || Array.from(entry.emails)[0] || '';

    const latestPhone = latestOrder?.customer?.phone?.trim();
    const primaryPhone = latestPhone || Array.from(entry.phones)[0] || '';

    const lastOrderDate = parseDate(latestOrder?.createdAt);
    const earliestOrder = entry.orders[entry.orders.length - 1];
    const firstOrderDate = parseDate(earliestOrder?.createdAt);

    customers.push({
      uid: entry.uid,
      name:
        primaryName ||
        (primaryEmail ? primaryEmail.split('@')[0] : `Customer ${entry.uid.slice(0, 6)}`),
      email: primaryEmail,
      phone: primaryPhone,
      totalOrders: entry.orders.length,
      verifiedSpending: totalSpending,
      verifiedOrdersCount: verifiedCount,
      firstOrderDate,
      lastOrderDate,
      shippingAddresses: Array.from(entry.shippingMap.values()),
      orders: entry.orders,
    });
  }

  // Default sort: most recent active order first
  customers.sort((a, b) => {
    const timeB = b.lastOrderDate ? b.lastOrderDate.getTime() : 0;
    const timeA = a.lastOrderDate ? a.lastOrderDate.getTime() : 0;
    return timeB - timeA;
  });

  return customers;
}

/**
 * Fetches all orders from Cloud Firestore and produces the deduplicated customer directory
 */
export async function fetchCustomers(): Promise<CustomerRecord[]> {
  const orders = await fetchOrders();
  return aggregateCustomersFromOrders(orders);
}

export { formatINR };
