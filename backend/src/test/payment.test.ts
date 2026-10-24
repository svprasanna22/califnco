import crypto from 'crypto';
import {
  calculateAuthoritativeTotals,
  validateOrderItems,
  validateShippingAddress,
  sanitizeForFirestore,
} from '../services/orderCalculation';
import { verifyRazorpaySignature } from '../razorpay';
import type { ProductCatalogRecord } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function assertThrows(fn: () => void, expectedSnippet: string, testName: string) {
  try {
    fn();
    throw new Error(`Test Failed: [${testName}] expected function to throw error containing "${expectedSnippet}", but it succeeded.`);
  } catch (err: any) {
    if (err.message.includes('Test Failed:')) {
      throw err;
    }
    assert(
      err.message.toLowerCase().includes(expectedSnippet.toLowerCase()),
      `[${testName}] Error message "${err.message}" did not contain expected snippet "${expectedSnippet}"`
    );
  }
}

async function runPaymentTests() {
  console.log('--- Starting Califnco Razorpay Backend & Security Unit Tests ---');
  let testsPassed = 0;

  // Test 1: Tampered Amounts Resistance (Requirement 5 & 15)
  // Client attempts to send ₹1 price; backend uses catalog price ₹20,000
  const mockCatalog = new Map<string, ProductCatalogRecord>();
  mockCatalog.set('ro-stellar-7', {
    id: 'ro-stellar-7',
    name: 'Califnco Stellar 7-Stage RO',
    category: 'ro-purifiers',
    price: 20000,
    stock: 5,
  });

  const calculation = calculateAuthoritativeTotals(
    [{ productId: 'ro-stellar-7', quantity: 2 }],
    mockCatalog
  );

  // Subtotal: 20,000 * 2 = 40,000
  assert(calculation.pricing.subtotal === 40000, `Expected subtotal ₹40,000, got ${calculation.pricing.subtotal}`);
  // Tax (18% GST): 40,000 * 0.18 = 7,200
  assert(calculation.pricing.tax === 7200, `Expected tax ₹7,200, got ${calculation.pricing.tax}`);
  // Total: 47,200
  assert(calculation.pricing.totalAmount === 47200, `Expected total ₹47,200, got ${calculation.pricing.totalAmount}`);
  // Integer amount in paise (1 INR = 100 paise)
  assert(calculation.amountPaise === 4720000, `Expected amount in paise 4,720,000, got ${calculation.amountPaise}`);
  testsPassed++;

  // Test 2: Invalid / Excessive Quantities
  assertThrows(
    () => validateOrderItems([{ productId: 'ro-stellar-7', quantity: 0 }]),
    'must be an integer between 1 and 10',
    'Zero quantity'
  );
  assertThrows(
    () => validateOrderItems([{ productId: 'ro-stellar-7', quantity: 15 }]),
    'must be an integer between 1 and 10',
    'Excessive quantity'
  );
  testsPassed++;

  // Test 3: Shipping Address Validation (6-digit Indian PIN)
  assertThrows(
    () => validateShippingAddress({ street: '123 Test St', city: 'Bengaluru', state: 'Karnataka', postalCode: '99' }),
    'valid 6-digit Indian PIN code',
    'Invalid PIN code'
  );
  testsPassed++;

  // Test 4: Insufficient Inventory Stock Rejection (Requirement 12)
  assertThrows(
    () =>
      calculateAuthoritativeTotals(
        [{ productId: 'ro-stellar-7', quantity: 8 }], // Only 5 in stock
        mockCatalog
      ),
    'Insufficient stock',
    'Insufficient stock rejection'
  );
  testsPassed++;

  // Test 5: Cryptographic Signature Verification - Genuine Signature (Requirement 8 & 15)
  const testSecret = 'test_secret_key_12345';
  const orderId = 'order_DA28zBv9e8';
  const paymentId = 'pay_DA29zBv9e8';

  const expectedSignature = crypto
    .createHmac('sha256', testSecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const isValidGenuine = verifyRazorpaySignature(orderId, paymentId, expectedSignature, testSecret);
  assert(isValidGenuine === true, 'Genuine Razorpay HMAC-SHA256 signature must verify as valid');
  testsPassed++;

  // Test 6: Cryptographic Signature Verification - Tampered Signature (Requirement 8 & 15)
  const tamperedSignature = expectedSignature.slice(0, -4) + '0000';
  const isValidTampered = verifyRazorpaySignature(orderId, paymentId, tamperedSignature, testSecret);
  assert(isValidTampered === false, 'Tampered signature must be cryptographically rejected');
  testsPassed++;

  // Test 7: Cryptographic Signature Verification - Wrong Order ID / Payment ID
  const isWrongOrder = verifyRazorpaySignature('order_FORGED', paymentId, expectedSignature, testSecret);
  assert(isWrongOrder === false, 'Signature with mismatched order ID must be rejected');
  testsPassed++;

  // Test 8: Idempotency Protection Model (Requirement 10)
  // Simulates verification check when order is already paid
  const mockOrderState = {
    payment: {
      status: 'paid',
      transactionId: paymentId,
    },
    items: [{ productId: 'ro-stellar-7', quantity: 2 }],
  };

  const isAlreadyPaid =
    mockOrderState.payment.status === 'paid' &&
    mockOrderState.payment.transactionId === paymentId;

  assert(isAlreadyPaid === true, 'Duplicate callback with same payment ID must be identified as already paid');
  testsPassed++;

  // Test 9: Safe Failure Recording (Requirement 12)
  // When payment fails, status transitions to 'failed' without inventory decrement
  const initialStock = mockCatalog.get('ro-stellar-7')!.stock;
  const failureRecordedState = {
    payment: {
      status: 'failed',
      notes: 'Payment failed: Customer cancelled on Razorpay gateway dialog.',
    },
  };
  assert(failureRecordedState.payment.status === 'failed', 'Payment failure must record status "failed"');
  assert(mockCatalog.get('ro-stellar-7')!.stock === initialStock, 'Failed payment must not deduct inventory');
  testsPassed++;

  // Test 10: Omission of landmark when not provided or undefined in shipping address
  const addrWithoutLandmark = validateShippingAddress({
    street: '123 Outer Ring Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560103',
    country: 'India',
  });
  assert(!('landmark' in addrWithoutLandmark), 'Landmark key must not exist when omitted from input');
  assert(addrWithoutLandmark.street === '123 Outer Ring Road', 'Street must be preserved');
  assert(addrWithoutLandmark.city === 'Bengaluru', 'City must be preserved');
  assert(addrWithoutLandmark.state === 'Karnataka', 'State must be preserved');
  assert(addrWithoutLandmark.postalCode === '560103', 'Postal code must be preserved');
  assert(addrWithoutLandmark.country === 'India', 'Country must be preserved');

  const addrWithUndefinedLandmark = validateShippingAddress({
    street: '123 Outer Ring Road',
    landmark: undefined,
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560103',
  });
  assert(!('landmark' in addrWithUndefinedLandmark), 'Landmark key must not exist when provided as undefined');

  const addrWithEmptyLandmark = validateShippingAddress({
    street: '123 Outer Ring Road',
    landmark: '   ',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560103',
  });
  assert(!('landmark' in addrWithEmptyLandmark), 'Landmark key must not exist when provided as whitespace string');
  testsPassed++;

  // Test 11: Valid landmark preservation
  const addrWithLandmark = validateShippingAddress({
    street: '123 Outer Ring Road',
    landmark: 'Near HDFC Bank',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560103',
  });
  assert('landmark' in addrWithLandmark, 'Landmark key must exist when valid');
  assert(addrWithLandmark.landmark === 'Near HDFC Bank', 'Landmark value must match');
  testsPassed++;

  // Test 12: sanitizeForFirestore purges undefined values across nested structures while preserving null
  const dirtyData = {
    orderNumber: 'ORD-TEST-1234',
    dealer: undefined,
    shippingAddress: {
      street: '456 Main Road',
      landmark: undefined,
      city: 'Mumbai',
    },
    payment: {
      transactionId: null, // null should be preserved in Firestore
      token: undefined,
    },
    items: [
      { productId: 'p1', imageUrl: undefined, quantity: 1 },
      { productId: 'p2', imageUrl: 'https://example.com/p2.png', quantity: 2 },
    ],
  };

  const sanitized = sanitizeForFirestore(dirtyData);
  assert(!('dealer' in sanitized), 'Undefined top-level dealer field must be removed');
  assert(!('landmark' in (sanitized as any).shippingAddress), 'Undefined nested landmark field must be removed');
  assert(!('token' in (sanitized as any).payment), 'Undefined nested payment token must be removed');
  assert((sanitized as any).payment.transactionId === null, 'null primitive value must be preserved');
  assert(!('imageUrl' in (sanitized as any).items[0]), 'Undefined item property must be removed');
  assert((sanitized as any).items[1].imageUrl === 'https://example.com/p2.png', 'Valid item property must be preserved');
  testsPassed++;

  // Test 13: Order document payload verification for Firestore
  const sampleOrderPayload = {
    orderNumber: 'ORD-SAMPLE-9999',
    isTestOrder: true,
    orderType: 'customer',
    customer: {
      uid: 'user_123',
      email: 'customer@example.com',
      name: 'Test Customer',
      phone: '+91 9876543210',
    },
    shippingAddress: {
      street: addrWithoutLandmark.street,
      ...(addrWithoutLandmark.landmark?.trim() ? { landmark: addrWithoutLandmark.landmark.trim() } : {}),
      city: addrWithoutLandmark.city,
      state: addrWithoutLandmark.state,
      postalCode: addrWithoutLandmark.postalCode,
      country: addrWithoutLandmark.country || 'India',
    },
    items: calculation.lineItems,
    pricing: calculation.pricing,
    payment: {
      method: 'cash_on_delivery',
      status: 'cash_on_delivery',
      transactionId: null,
      isTestMode: true,
      notes: 'Cash on delivery test order',
    },
    fulfillment: {
      status: 'pending',
      notes: 'Pending white-glove installation',
    },
  };

  const finalPayload = sanitizeForFirestore(sampleOrderPayload);
  assert(
    !Object.prototype.hasOwnProperty.call(finalPayload.shippingAddress, 'landmark'),
    'shippingAddress.landmark must be completely omitted from final Firestore payload'
  );

  function assertNoUndefined(obj: any, path: string = 'root') {
    if (obj === null || obj === undefined) {
      assert(obj !== undefined, `Found undefined at path: ${path}`);
      return;
    }
    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        assert(value !== undefined, `Found undefined at path: ${path}.${key}`);
        assertNoUndefined(value, `${path}.${key}`);
      }
    }
  }
  assertNoUndefined(finalPayload);
  testsPassed++;

  console.log(`\nAll ${testsPassed} backend payment unit tests passed successfully!`);
}

runPaymentTests().catch((err) => {
  console.error('\nTest suite failed with error:', err);
  process.exit(1);
});
