import type {
  OrderItemInput,
  ShippingAddressInput,
  ProductCatalogRecord,
  OrderLineItem,
  OrderPricing,
} from '../types';

export const GST_RATE = 0.18; // 18% standard GST on water purifier equipment
export const MAX_ITEMS_PER_ORDER = 20;
export const MAX_QUANTITY_PER_ITEM = 10;

export function isValidPostalCode(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin.trim());
}

export function isValidPhone(phone: string): boolean {
  const sanitized = phone.replace(/[\s\-()]/g, '');
  return /^(\+91)?[6-9]\d{9}$/.test(sanitized) || /^\+[1-9]\d{7,14}$/.test(sanitized);
}

export function validateOrderItems(rawItems: any[]): OrderItemInput[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Order must contain at least one product item.');
  }

  if (rawItems.length > MAX_ITEMS_PER_ORDER) {
    throw new Error(`Orders cannot exceed ${MAX_ITEMS_PER_ORDER} distinct product items.`);
  }

  const consolidatedMap = new Map<string, number>();

  for (let idx = 0; idx < rawItems.length; idx++) {
    const it = rawItems[idx];
    if (!it || typeof it !== 'object') {
      throw new Error(`Item at index ${idx} is invalid.`);
    }
    if (!it.productId || typeof it.productId !== 'string' || !it.productId.trim()) {
      throw new Error(`Item at index ${idx} is missing a valid productId.`);
    }
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QUANTITY_PER_ITEM) {
      throw new Error(
        `Quantity for product "${it.productId}" must be an integer between 1 and ${MAX_QUANTITY_PER_ITEM}.`
      );
    }

    const current = consolidatedMap.get(it.productId.trim()) || 0;
    const nextTotal = current + qty;
    if (nextTotal > MAX_QUANTITY_PER_ITEM) {
      throw new Error(
        `Combined quantity for product "${it.productId}" exceeds maximum limit of ${MAX_QUANTITY_PER_ITEM} units.`
      );
    }
    consolidatedMap.set(it.productId.trim(), nextTotal);
  }

  return Array.from(consolidatedMap.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

export function validateShippingAddress(addr: any): ShippingAddressInput {
  if (!addr || typeof addr !== 'object') {
    throw new Error('Shipping address is required.');
  }
  if (!addr.street || typeof addr.street !== 'string' || addr.street.trim().length < 5) {
    throw new Error('Complete street address (at least 5 characters) is required.');
  }
  if (!addr.city || typeof addr.city !== 'string' || addr.city.trim().length < 2) {
    throw new Error('City is required.');
  }
  if (!addr.state || typeof addr.state !== 'string' || addr.state.trim().length < 2) {
    throw new Error('State / Region is required.');
  }
  if (!addr.postalCode || typeof addr.postalCode !== 'string' || !isValidPostalCode(addr.postalCode)) {
    throw new Error('A valid 6-digit Indian PIN code is required (e.g. 560001).');
  }

  const cleaned: ShippingAddressInput = {
    street: addr.street.trim(),
    ...(typeof addr.landmark === 'string' && addr.landmark.trim()
      ? { landmark: addr.landmark.trim() }
      : {}),
    city: addr.city.trim(),
    state: addr.state.trim(),
    postalCode: addr.postalCode.trim(),
    country: typeof addr.country === 'string' && addr.country.trim() ? addr.country.trim() : 'India',
  };
  return cleaned;
}

export function calculateAuthoritativeTotals(
  items: OrderItemInput[],
  catalogMap: Map<string, ProductCatalogRecord>
): {
  lineItems: OrderLineItem[];
  pricing: OrderPricing;
  amountPaise: number;
} {
  const lineItems: OrderLineItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = catalogMap.get(item.productId);
    if (!product) {
      throw new Error(`Product "${item.productId}" was not found in the catalog.`);
    }

    const availableStock = Number(product.stock ?? 0);
    if (availableStock < item.quantity) {
      throw new Error(
        `Insufficient stock for "${product.name}". Only ${availableStock} unit(s) available, but ${item.quantity} requested.`
      );
    }

    const price = Number(product.price);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Catalog price for "${product.name}" is invalid.`);
    }

    const itemTotal = price * item.quantity;
    subtotal += itemTotal;

    const lineItem: OrderLineItem = {
      productId: product.id,
      name: product.name,
      category: product.category,
      price,
      quantity: item.quantity,
      total: itemTotal,
      ...(product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim()
        ? { imageUrl: product.imageUrl.trim() }
        : {}),
    };
    lineItems.push(lineItem);
  }

  const tax = Math.round(subtotal * GST_RATE);
  const shipping = 0; // Complimentary white-glove installation
  const totalAmount = subtotal + tax + shipping;
  const amountPaise = Math.round(totalAmount * 100);

  return {
    lineItems,
    pricing: {
      subtotal,
      tax,
      shipping,
      totalAmount,
    },
    amountPaise,
  };
}

export function generateOrderNumber(): string {
  const timePart = Date.now().toString(36).toUpperCase().slice(-4);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${timePart}-${randomPart}`;
}

/**
 * Recursively sanitizes any payload destined for Firestore by omitting keys with undefined values.
 * Preserves null, numbers, strings, booleans, arrays, Dates, and Firestore FieldValues.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    // Preserve FieldValue (e.g. serverTimestamp) or Date instances
    const obj = data as Record<string, any>;
    if (
      (obj.constructor && obj.constructor.name !== 'Object') ||
      typeof obj.isEqual === 'function'
    ) {
      return data;
    }

    const cleanedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleanedObj[key] = sanitizeForFirestore(value);
      }
    }
    return cleanedObj as T;
  }

  return data;
}
