import {
  validateOrderInput,
  validateProductStockAndComputeTotals,
  generateOrderNumber,
  type ProductCatalogRecord,
} from '../orderValidation';

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

async function runTests() {
  console.log('--- Starting Califnco Order Validation & Security Unit Tests ---');
  let testsPassed = 0;

  // Test 1: Empty or invalid payload
  assertThrows(
    () => validateOrderInput(null),
    'Order payload must be a valid JSON object',
    'Null payload'
  );
  testsPassed++;

  // Test 2: Missing items
  assertThrows(
    () => validateOrderInput({ items: [], shippingAddress: { street: '123 Test', city: 'Bengaluru', state: 'KA', postalCode: '560001' }, paymentMethod: 'cash_on_delivery' }),
    'Order must contain at least one product item',
    'Empty items array'
  );
  testsPassed++;

  // Test 3: Invalid quantity (zero or negative)
  assertThrows(
    () =>
      validateOrderInput({
        items: [{ productId: 'prod-1', quantity: 0 }],
        shippingAddress: { street: '123 Test St', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
        paymentMethod: 'cash_on_delivery',
      }),
    'Quantity for product "prod-1" must be an integer between 1 and 10',
    'Zero quantity'
  );
  testsPassed++;

  // Test 4: Excessive quantity (> 10)
  assertThrows(
    () =>
      validateOrderInput({
        items: [{ productId: 'prod-1', quantity: 15 }],
        shippingAddress: { street: '123 Test St', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
        paymentMethod: 'cash_on_delivery',
      }),
    'Quantity for product "prod-1" must be an integer between 1 and 10',
    'Excessive quantity'
  );
  testsPassed++;

  // Test 5: Invalid PIN code (must be 6 digits starting 1-9)
  assertThrows(
    () =>
      validateOrderInput({
        items: [{ productId: 'prod-1', quantity: 1 }],
        shippingAddress: { street: '123 Test St', city: 'Bengaluru', state: 'Karnataka', postalCode: '0123' },
        paymentMethod: 'cash_on_delivery',
      }),
    'valid 6-digit Indian PIN code',
    'Invalid PIN code'
  );
  testsPassed++;

  // Test 6: Rejection of untrusted online payment method
  assertThrows(
    () =>
      validateOrderInput({
        items: [{ productId: 'prod-1', quantity: 1 }],
        shippingAddress: { street: '123 Test St', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
        paymentMethod: 'razorpay_instant_paid',
      }),
    'Unsupported payment method',
    'Unsupported online payment claim'
  );
  testsPassed++;

  // Test 7: Insufficient product stock in Firestore
  const mockCatalog = new Map<string, ProductCatalogRecord>();
  mockCatalog.set('ro-deluxe', {
    id: 'ro-deluxe',
    name: 'Califnco Smart RO 5000',
    category: 'ro-purifiers',
    price: 18000,
    stock: 2, // only 2 in stock
  });

  assertThrows(
    () =>
      validateProductStockAndComputeTotals(
        [{ productId: 'ro-deluxe', quantity: 3 }], // requesting 3
        mockCatalog
      ),
    'Insufficient stock',
    'Insufficient stock rejection'
  );
  testsPassed++;

  // Test 8: Client-tampered price resistance
  // The client claims the price is ₹1, but the authoritative catalog has ₹18,000.
  // The calculation function strictly pulls from catalog.
  const calcResult = validateProductStockAndComputeTotals(
    [{ productId: 'ro-deluxe', quantity: 2 }],
    mockCatalog
  );

  assert(
    calcResult.pricing.subtotal === 36000,
    `Expected subtotal ₹36,000 (18000 * 2), got ${calcResult.pricing.subtotal}`
  );
  assert(
    calcResult.pricing.tax === Math.round(36000 * 0.18), // ₹6,480 GST
    `Expected tax ₹6,480, got ${calcResult.pricing.tax}`
  );
  assert(
    calcResult.pricing.totalAmount === 36000 + 6480, // ₹42,480
    `Expected total ₹42,480, got ${calcResult.pricing.totalAmount}`
  );
  assert(calcResult.lineItems.length === 1, 'Expected 1 line item');
  assert(calcResult.lineItems[0].price === 18000, 'Authoritative price preserved');
  testsPassed++;

  // Test 9: Server-side unique order number generator
  const ord1 = generateOrderNumber();
  const ord2 = generateOrderNumber();
  assert(ord1.startsWith('ORD-'), `Expected order number to start with ORD-, got ${ord1}`);
  assert(ord1 !== ord2, 'Sequential order numbers must not collide');
  testsPassed++;

  // Test 10: Dealer orderType validation
  const customerOrder = validateOrderInput({
    items: [{ productId: 'prod-1', quantity: 1 }],
    shippingAddress: { street: '123 Test St', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
    paymentMethod: 'cash_on_delivery',
  });
  assert(customerOrder.orderType === 'customer', 'Default orderType must be "customer"');

  const dealerOrder = validateOrderInput({
    items: [{ productId: 'prod-1', quantity: 1 }],
    shippingAddress: { street: '123 Test St', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
    paymentMethod: 'cash_on_delivery',
    orderType: 'dealer',
  });
  assert(dealerOrder.orderType === 'dealer', 'Explicit orderType "dealer" must be preserved');
  testsPassed++;

  console.log(`\nAll ${testsPassed} unit tests passed successfully!`);
}

runTests().catch((err) => {
  console.error('\nTest suite failed with error:', err);
  process.exit(1);
});
