import type {
  CreateOrderRequest,
  OrderLineItem,
  OrderPricing,
} from './types';

export const GST_RATE = 0.18; // 18% GST standard on water filtration equipment
export const MAX_ITEMS_PER_ORDER = 20;
export const MAX_QUANTITY_PER_ITEM = 10;

export interface ProductCatalogRecord {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  imageUrl?: string;
}

export function isValidPostalCode(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin.trim());
}

export function isValidPhone(phone: string): boolean {
  const sanitized = phone.replace(/[\s\-()]/g, '');
  return /^(\+91)?[6-9]\d{9}$/.test(sanitized) || /^\+[1-9]\d{7,14}$/.test(sanitized);
}

/**
 * Validates request payload structure, boundaries, and payment method
 */
export function validateOrderInput(input: any): CreateOrderRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Order payload must be a valid JSON object.');
  }

  // 1. Items array validation
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Order must contain at least one product item.');
  }

  if (input.items.length > MAX_ITEMS_PER_ORDER) {
    throw new Error(`Orders cannot exceed ${MAX_ITEMS_PER_ORDER} distinct product items.`);
  }

  const validatedItems = input.items.map((item: any, idx: number) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Item at index ${idx} is invalid.`);
    }
    if (!item.productId || typeof item.productId !== 'string' || !item.productId.trim()) {
      throw new Error(`Item at index ${idx} is missing a valid productId.`);
    }
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QUANTITY_PER_ITEM) {
      throw new Error(
        `Quantity for product "${item.productId}" must be an integer between 1 and ${MAX_QUANTITY_PER_ITEM}.`
      );
    }
    return {
      productId: item.productId.trim(),
      quantity: qty,
    };
  });

  // Deduplicate product IDs if submitted multiple times
  const consolidatedMap = new Map<string, number>();
  for (const item of validatedItems) {
    const current = consolidatedMap.get(item.productId) || 0;
    const nextTotal = current + item.quantity;
    if (nextTotal > MAX_QUANTITY_PER_ITEM) {
      throw new Error(
        `Combined quantity for product "${item.productId}" exceeds maximum limit of ${MAX_QUANTITY_PER_ITEM} units.`
      );
    }
    consolidatedMap.set(item.productId, nextTotal);
  }

  const consolidatedItems = Array.from(consolidatedMap.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  // 2. Shipping address validation
  const addr = input.shippingAddress;
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

  // 3. Payment method validation
  // Security Guarantee: Only cash_on_delivery is accepted. Client cannot claim online payment succeeded.
  if (input.paymentMethod !== 'cash_on_delivery') {
    throw new Error(
      `Unsupported payment method "${input.paymentMethod}". Only "cash_on_delivery" is currently supported for direct order placement.`
    );
  }

  return {
    items: consolidatedItems,
    shippingAddress: {
      street: addr.street.trim(),
      landmark: typeof addr.landmark === 'string' ? addr.landmark.trim() : undefined,
      city: addr.city.trim(),
      state: addr.state.trim(),
      postalCode: addr.postalCode.trim(),
      country: typeof addr.country === 'string' && addr.country.trim() ? addr.country.trim() : 'India',
    },
    customerInfo: {
      name: typeof input.customerInfo?.name === 'string' ? input.customerInfo.name.trim() : undefined,
      phone: typeof input.customerInfo?.phone === 'string' ? input.customerInfo.phone.trim() : undefined,
    },
    paymentMethod: 'cash_on_delivery',
    orderType: input.orderType === 'dealer' ? 'dealer' : 'customer',
  };
}

/**
 * Validates stock and calculates authoritative order pricing strictly from Firestore catalog data
 */
export function validateProductStockAndComputeTotals(
  requestedItems: Array<{ productId: string; quantity: number }>,
  productsMap: Map<string, ProductCatalogRecord>
): {
  lineItems: OrderLineItem[];
  pricing: OrderPricing;
} {
  const lineItems: OrderLineItem[] = [];
  let subtotal = 0;

  for (const requested of requestedItems) {
    const product = productsMap.get(requested.productId);

    if (!product) {
      throw new Error(`Product with ID "${requested.productId}" was not found in the catalog.`);
    }

    const availableStock = Number(product.stock ?? 0);
    if (availableStock < requested.quantity) {
      throw new Error(
        `Insufficient stock for "${product.name}". Only ${availableStock} unit(s) available, but ${requested.quantity} requested.`
      );
    }

    const authoritativePrice = Number(product.price);
    if (isNaN(authoritativePrice) || authoritativePrice <= 0) {
      throw new Error(`Authoritative catalog price for "${product.name}" is invalid.`);
    }

    const itemTotal = authoritativePrice * requested.quantity;
    subtotal += itemTotal;

    lineItems.push({
      productId: product.id,
      name: product.name,
      category: product.category || 'ro-purifiers',
      price: authoritativePrice,
      quantity: requested.quantity,
      total: itemTotal,
      imageUrl: product.imageUrl || '',
    });
  }

  // Authoritative server-side pricing calculation
  const tax = Math.round(subtotal * GST_RATE);
  const shipping = 0; // Complimentary standard white-glove installation delivery
  const totalAmount = subtotal + tax + shipping;

  return {
    lineItems,
    pricing: {
      subtotal,
      tax,
      shipping,
      totalAmount,
    },
  };
}

/**
 * Generates unique collision-resistant order number server-side
 */
export function generateOrderNumber(): string {
  const timePart = Date.now().toString(36).toUpperCase().slice(-4);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${timePart}-${randomPart}`;
}
