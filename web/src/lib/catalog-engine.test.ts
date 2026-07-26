import {
  calculateSellableStock,
  compareCartSnapshot,
  determineConversionReadiness,
  repriceCart,
  validateCartItemQuantity,
  validateOfferConfirmation,
} from './catalog-engine';

process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Unhandled Rejection in test runner:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception in test runner:', err);
  process.exit(1);
});

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  ✓ PASS: ${name}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error: errorMsg });
    console.error(`  ✗ FAIL: ${name}\n    ${errorMsg}`);
  }
}

console.log('=== RUNNING PURE CATALOG STOCK, CART & OFFER ENGINE STRICT HARDENED TESTS ===\n');

// 1. physical stock 5, reservation 1 -> sellable 4
runTest('1. physical stock 5, reservation 1 -> sellable 4', () => {
  const sellable = calculateSellableStock({ physicalStock: 5, activeReservedQuantity: 1 });
  assert(sellable === 4, 'sellable stock must be 4');
});

// 2. physical stock 1, reservation 1 -> sellable 0
runTest('2. physical stock 1, reservation 1 -> sellable 0', () => {
  const sellable = calculateSellableStock({ physicalStock: 1, activeReservedQuantity: 1 });
  assert(sellable === 0, 'sellable stock must be 0');
});

// 3. reservation physical stocktan büyük -> error
runTest('3. reservation physical stocktan büyük -> error', () => {
  let threw = false;
  try {
    calculateSellableStock({ physicalStock: 5, activeReservedQuantity: 10 });
  } catch {
    threw = true;
  }
  assert(threw, 'Must throw error when activeReservedQuantity exceeds physicalStock');
});

// 4. requested quantity sellable stocktan büyük -> reject
runTest('4. requested quantity sellable stocktan büyük -> reject', () => {
  const res = validateCartItemQuantity({
    requestedQuantity: 5,
    sellableStock: 2,
    productActive: true,
    whatsappVisible: true,
  });
  assert(!res.valid, 'must be invalid');
  assert(res.allowedQuantity === 2, 'allowedQuantity must be 2');
  assert(res.issueCode === 'INSUFFICIENT_STOCK', 'issueCode must be INSUFFICIENT_STOCK');
});

// 5. requested quantity 0 -> reject
runTest('5. requested quantity 0 -> reject', () => {
  const res = validateCartItemQuantity({
    requestedQuantity: 0,
    sellableStock: 10,
    productActive: true,
    whatsappVisible: true,
  });
  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'INVALID_QUANTITY', 'issueCode must be INVALID_QUANTITY');
});

// 6. decimal quantity -> reject
runTest('6. decimal quantity -> reject', () => {
  const res = validateCartItemQuantity({
    requestedQuantity: 2.5,
    sellableStock: 10,
    productActive: true,
    whatsappVisible: true,
  });
  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'INVALID_QUANTITY', 'issueCode must be INVALID_QUANTITY');
});

// 7. NaN quantity -> reject
runTest('7. NaN quantity -> reject', () => {
  const res = validateCartItemQuantity({
    requestedQuantity: NaN,
    sellableStock: 10,
    productActive: true,
    whatsappVisible: true,
  });
  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'INVALID_QUANTITY', 'issueCode must be INVALID_QUANTITY');
});

// 8. inactive product -> reject
runTest('8. inactive product -> reject', () => {
  const res = validateCartItemQuantity({
    requestedQuantity: 1,
    sellableStock: 10,
    productActive: false,
    whatsappVisible: true,
  });
  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'PRODUCT_INACTIVE', 'issueCode must be PRODUCT_INACTIVE');
});

// 9. whatsappVisible false -> reject
runTest('9. whatsappVisible false -> reject', () => {
  const res = validateCartItemQuantity({
    requestedQuantity: 1,
    sellableStock: 10,
    productActive: true,
    whatsappVisible: false,
  });
  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'CHANNEL_NOT_VISIBLE', 'issueCode must be CHANNEL_NOT_VISIBLE');
});

// 10. price unchanged -> valid, reconfirmation false
runTest('10. price unchanged -> valid, reconfirmation false', () => {
  const res = repriceCart({
    cartItems: [
      {
        productId: 'P1',
        quantity: 2,
        unitPriceSnapshotCents: 10000,
        productNameSnapshot: 'Şarj Adaptörü',
      },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Şarj Adaptörü',
        currentSku: 'SKU1',
        currentUnitPriceCents: 10000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(res.valid, 'cart must be valid');
  assert(res.validLinesSubtotalCents === 20000, 'validLinesSubtotalCents must be 20000');
  assert(res.orderTotalCents === 20000, 'orderTotalCents must be 20000 when valid === true');
  assert(!res.requiresCustomerReconfirmation, 'requiresCustomerReconfirmation must be false');
});

// 11. price changed -> PRICE_CHANGED + reconfirmation true
runTest('11. price changed -> PRICE_CHANGED + reconfirmation true', () => {
  const res = repriceCart({
    cartItems: [
      {
        productId: 'P1',
        quantity: 1,
        unitPriceSnapshotCents: 10000,
        productNameSnapshot: 'Şarj Adaptörü',
      },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Şarj Adaptörü',
        currentSku: 'SKU1',
        currentUnitPriceCents: 12000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(!res.valid, 'cart must be invalid due to PRICE_CHANGED');
  assert(res.orderTotalCents === null, 'orderTotalCents must be null when valid === false');
  assert(res.requiresCustomerReconfirmation, 'requiresCustomerReconfirmation must be true');
  assert(res.issues.includes('PRICE_CHANGED'), 'issues must include PRICE_CHANGED');
});

// 12. name changed but price unchanged -> METADATA_CHANGED
runTest('12. name changed but price unchanged -> METADATA_CHANGED', () => {
  const res = repriceCart({
    cartItems: [
      {
        productId: 'P1',
        quantity: 1,
        unitPriceSnapshotCents: 10000,
        productNameSnapshot: 'Eski İsim',
      },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Yeni İsim',
        currentSku: 'SKU1',
        currentUnitPriceCents: 10000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(res.valid, 'cart is valid when price/quantity valid');
  assert(res.lines[0].metadataChanged, 'line metadataChanged must be true');
  assert(res.issues.includes('METADATA_CHANGED'), 'issues must contain METADATA_CHANGED');
});

// 13. product removed -> PRODUCT_NOT_FOUND / cart invalid
runTest('13. product removed -> PRODUCT_NOT_FOUND / cart invalid', () => {
  const res = repriceCart({
    cartItems: [
      {
        productId: 'P_REMOVED',
        quantity: 1,
        unitPriceSnapshotCents: 5000,
        productNameSnapshot: 'Silinen Ürün',
      },
    ],
    currentProducts: [],
  });

  assert(!res.valid, 'cart must be invalid');
  assert(res.orderTotalCents === null, 'orderTotalCents must be null');
  assert(res.issues.includes('PRODUCT_NOT_FOUND'), 'issues must contain PRODUCT_NOT_FOUND');
});

// 14. Real Stock Change Test A: stock changed but quantity still available
runTest('14. Real Stock Change Test A: previousStock 5 -> currentStock 4, reqQty 2 (Valid)', () => {
  const res = repriceCart({
    cartItems: [
      {
        productId: 'P1',
        quantity: 2,
        unitPriceSnapshotCents: 5000,
        productNameSnapshot: 'Kablo',
        sellableStockSnapshot: 5,
      },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Kablo',
        currentSku: 'SKU1',
        currentUnitPriceCents: 5000,
        physicalStock: 4,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(res.valid, 'cart must be valid since requested quantity 2 <= sellable stock 4');
  assert(res.lines[0].previousSellableStock === 5, 'previousSellableStock must be 5');
  assert(res.lines[0].currentSellableStock === 4, 'currentSellableStock must be 4');
  assert(res.lines[0].stockChanged, 'stockChanged must be true');
  assert(res.orderTotalCents === 10000, 'orderTotalCents must be 10000');
  assert(!res.issues.includes('INSUFFICIENT_STOCK'), 'must not contain INSUFFICIENT_STOCK');
});

// 15. Real Stock Change Test B: stock changed and quantity unavailable
runTest('15. Real Stock Change Test B: previousStock 5 -> currentStock 1, reqQty 2 (Invalid)', () => {
  const res = repriceCart({
    cartItems: [
      {
        productId: 'P1',
        quantity: 2,
        unitPriceSnapshotCents: 5000,
        productNameSnapshot: 'Kablo',
        sellableStockSnapshot: 5,
      },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Kablo',
        currentSku: 'SKU1',
        currentUnitPriceCents: 5000,
        physicalStock: 1,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(!res.valid, 'cart must be invalid due to INSUFFICIENT_STOCK');
  assert(res.lines[0].stockChanged, 'stockChanged must be true');
  assert(res.orderTotalCents === null, 'orderTotalCents must be null when invalid');
  assert(res.issues.includes('INSUFFICIENT_STOCK'), 'issues must include INSUFFICIENT_STOCK');
});

// 16. compareCartSnapshot price & quantity change detection
runTest('16. compareCartSnapshot price & quantity change detection', () => {
  const res = compareCartSnapshot({
    previousSnapshot: [
      { productId: 'P1', quantity: 2, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
    ],
    currentSnapshot: [
      { productId: 'P1', quantity: 3, unitPriceSnapshotCents: 6000, productNameSnapshot: 'Kablo' },
    ],
  });

  assert(res.changed, 'snapshot must be changed');
  assert(res.requiresCustomerReconfirmation, 'requiresCustomerReconfirmation must be true');
  assert(res.changes.includes('QUANTITY_CHANGED'), 'changes must include QUANTITY_CHANGED');
  assert(res.changes.includes('PRICE_CHANGED'), 'changes must include PRICE_CHANGED');
  assert(res.changes.includes('MULTIPLE_CHANGES'), 'changes must include MULTIPLE_CHANGES');
  assert(res.previousTotalCents === 10000, 'previousTotalCents must be 10000');
  assert(res.currentTotalCents === 18000, 'currentTotalCents must be 18000');
});

// 17. duplicate cart product -> reject
runTest('17. duplicate cart product -> reject', () => {
  const res = repriceCart({
    cartItems: [
      { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Kablo',
        currentSku: 'SKU1',
        currentUnitPriceCents: 5000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(!res.valid, 'must be invalid due to duplicate cart item');
  assert(res.issues.includes('DUPLICATE_CART_ITEM'), 'issues must include DUPLICATE_CART_ITEM');
});

// 18. Duplicate currentProducts (same price) -> throws DUPLICATE_CURRENT_PRODUCT
runTest('18. Duplicate currentProducts (same price) -> throws error', () => {
  let threw = false;
  try {
    repriceCart({
      cartItems: [
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      ],
      currentProducts: [
        {
          productId: 'P1',
          currentName: 'Kablo A',
          currentSku: 'SKU1',
          currentUnitPriceCents: 5000,
          physicalStock: 10,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
        {
          productId: 'P1',
          currentName: 'Kablo B',
          currentSku: 'SKU1',
          currentUnitPriceCents: 5000,
          physicalStock: 5,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('DUPLICATE_CURRENT_PRODUCT');
  }
  assert(threw, 'Must throw DUPLICATE_CURRENT_PRODUCT error when currentProducts has duplicate productId');
});

// 19. Duplicate currentProducts (different price/stock) -> throws DUPLICATE_CURRENT_PRODUCT
runTest('19. Duplicate currentProducts (different price/stock) -> throws error', () => {
  let threw = false;
  try {
    repriceCart({
      cartItems: [
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      ],
      currentProducts: [
        {
          productId: 'P1',
          currentName: 'Kablo',
          currentSku: 'SKU1',
          currentUnitPriceCents: 5000,
          physicalStock: 10,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
        {
          productId: 'P1',
          currentName: 'Kablo Alt',
          currentSku: 'SKU1',
          currentUnitPriceCents: 6000,
          physicalStock: 2,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('DUPLICATE_CURRENT_PRODUCT');
  }
  assert(threw, 'Must throw DUPLICATE_CURRENT_PRODUCT error on duplicate productId in currentProducts');
});

// 20. Unique items -> normal behavior preserved
runTest('20. Unique items -> normal behavior preserved', () => {
  const res = repriceCart({
    cartItems: [
      { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'A' },
      { productId: 'P2', quantity: 1, unitPriceSnapshotCents: 3000, productNameSnapshot: 'B' },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'A',
        currentSku: 'SKU1',
        currentUnitPriceCents: 5000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
      {
        productId: 'P2',
        currentName: 'B',
        currentSku: 'SKU2',
        currentUnitPriceCents: 3000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(res.valid, 'must be valid');
  assert(res.totalLineCount === 2, 'totalLineCount must be 2');
  assert(res.pricedLineCount === 2, 'pricedLineCount must be 2');
  assert(res.invalidLineCount === 0, 'invalidLineCount must be 0');
  assert(res.orderTotalCents === 8000, 'orderTotalCents must be 8000');
});

// 21. cart line integer kuruş calculation
runTest('21. cart line integer kuruş calculation', () => {
  const res = repriceCart({
    cartItems: [
      { productId: 'P1', quantity: 3, unitPriceSnapshotCents: 1250, productNameSnapshot: 'Ürün' },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Ürün',
        currentSku: 'SKU1',
        currentUnitPriceCents: 1250,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(res.lines[0].lineTotalCents === 3750, '3 * 1250 = 3750 kuruş (37,50 TL)');
});

// 22. validLinesSubtotalCents & orderTotalCents calculation
runTest('22. validLinesSubtotalCents & orderTotalCents calculation', () => {
  const res = repriceCart({
    cartItems: [
      { productId: 'P1', quantity: 2, unitPriceSnapshotCents: 1000, productNameSnapshot: 'A' },
      { productId: 'P2', quantity: 3, unitPriceSnapshotCents: 500, productNameSnapshot: 'B' },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'A',
        currentSku: 'SKU1',
        currentUnitPriceCents: 1000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
      {
        productId: 'P2',
        currentName: 'B',
        currentSku: 'SKU2',
        currentUnitPriceCents: 500,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(res.validLinesSubtotalCents === 3500, 'validLinesSubtotalCents must be 3500');
  assert(res.orderTotalCents === 3500, 'orderTotalCents must be 3500');
});

// 23. Invalid cart subtotal: 1 valid 1000 TL + 1 out of stock 500 TL -> orderTotalCents null
runTest('23. Invalid cart: 1 valid 1000 TL + 1 out of stock 500 TL -> orderTotalCents null', () => {
  const res = repriceCart({
    cartItems: [
      { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 100000, productNameSnapshot: 'Geçerli Ürün' },
      { productId: 'P2', quantity: 1, unitPriceSnapshotCents: 50000, productNameSnapshot: 'Stoksuz Ürün' },
    ],
    currentProducts: [
      {
        productId: 'P1',
        currentName: 'Geçerli Ürün',
        currentSku: 'SKU1',
        currentUnitPriceCents: 100000,
        physicalStock: 10,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
      {
        productId: 'P2',
        currentName: 'Stoksuz Ürün',
        currentSku: 'SKU2',
        currentUnitPriceCents: 50000,
        physicalStock: 0,
        activeReservedQuantity: 0,
        active: true,
        whatsappVisible: true,
      },
    ],
  });

  assert(!res.valid, 'cart valid must be false');
  assert(res.validLinesSubtotalCents === 100000, 'validLinesSubtotalCents must be 100000');
  assert(res.orderTotalCents === null, 'orderTotalCents MUST BE NULL when cart is invalid');
  assert(res.totalLineCount === 2, 'totalLineCount must be 2');
  assert(res.pricedLineCount === 1, 'pricedLineCount must be 1');
  assert(res.invalidLineCount === 1, 'invalidLineCount must be 1');
  assert(res.issues.includes('OUT_OF_STOCK'), 'issues must include OUT_OF_STOCK');
});

// 24. line total safe integer overflow -> reject
runTest('24. line total safe integer overflow -> reject', () => {
  let threw = false;
  try {
    repriceCart({
      cartItems: [
        { productId: 'P1', quantity: 1000, unitPriceSnapshotCents: Number.MAX_SAFE_INTEGER, productNameSnapshot: 'Overflow' },
      ],
      currentProducts: [
        {
          productId: 'P1',
          currentName: 'Overflow',
          currentSku: 'SKU1',
          currentUnitPriceCents: Number.MAX_SAFE_INTEGER,
          physicalStock: 2000,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe integer');
  }
  assert(threw, 'Must throw error on safe integer overflow on line total');
});

// 25. subtotal safe integer overflow -> reject
runTest('25. subtotal safe integer overflow -> reject', () => {
  let threw = false;
  try {
    repriceCart({
      cartItems: [
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: Number.MAX_SAFE_INTEGER - 100, productNameSnapshot: 'A' },
        { productId: 'P2', quantity: 1, unitPriceSnapshotCents: 500, productNameSnapshot: 'B' },
      ],
      currentProducts: [
        {
          productId: 'P1',
          currentName: 'A',
          currentSku: 'SKU1',
          currentUnitPriceCents: Number.MAX_SAFE_INTEGER - 100,
          physicalStock: 10,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
        {
          productId: 'P2',
          currentName: 'B',
          currentSku: 'SKU2',
          currentUnitPriceCents: 500,
          physicalStock: 10,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe integer');
  }
  assert(threw, 'Must throw error on safe integer overflow on subtotal');
});

// 26. old offer version -> reject
runTest('26. old offer version -> reject', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '2030-01-01T00:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'STALE_OFFER_VERSION', 'issueCode must be STALE_OFFER_VERSION');
});

// 27. latest offer version -> valid
runTest('27. latest offer version -> valid', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.1.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '2030-01-01T00:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(res.valid, 'must be valid');
  assert(res.issueCode === null, 'issueCode must be null');
});

// 28. Strict RFC3339: Equal time expiresAt == currentTime -> OFFER_EXPIRED
runTest('28. Strict RFC3339: Equal time expiresAt == currentTime -> OFFER_EXPIRED', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.1.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '2026-07-26T12:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(!res.valid, 'must be invalid when expiresAt <= currentTime');
  assert(res.issueCode === 'OFFER_EXPIRED', 'issueCode must be OFFER_EXPIRED');
});

// 29. Strict RFC3339: Date without timezone (2026-07-26T18:30:00) -> INVALID_DATE
runTest('29. Strict RFC3339: Date without timezone -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.1.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '2026-07-26T18:30:00',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(!res.valid, 'must be invalid when timezone missing');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 30. Strict RFC3339: Date format 2026-07-26 -> INVALID_DATE
runTest('30. Strict RFC3339: Date format YYYY-MM-DD -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.1.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '2026-07-26',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 31. Strict RFC3339: Date format MM/DD/YYYY -> INVALID_DATE
runTest('31. Strict RFC3339: Date format MM/DD/YYYY -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.1.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '07/26/2026',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 32. Strict RFC3339: Z format -> valid
runTest('32. Strict RFC3339: Z format -> valid', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.1.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '2026-07-26T15:30:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(res.valid, 'must be valid for Z format');
  assert(res.issueCode === null, 'issueCode must be null');
});

// 33. Strict RFC3339: +03:00 format -> valid
runTest('33. Strict RFC3339: +03:00 format -> valid', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.1.0',
    latestOfferVersion: 'v1.1.0',
    expiresAt: '2026-07-26T18:30:00+03:00',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-123',
  });

  assert(res.valid, 'must be valid for +03:00 offset');
  assert(res.issueCode === null, 'issueCode must be null');
});

// 34. Strict Real Calendar Test 1: 2026-02-31T12:00:00Z -> INVALID_DATE
runTest('34. Strict Real Calendar Test 1: 2026-02-31T12:00:00Z -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2026-02-31T12:00:00Z',
    currentTime: '2026-01-01T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-1',
  });
  assert(!res.valid, 'Feb 31 must be rejected');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 35. Strict Real Calendar Test 2: 2026-04-31T12:00:00Z -> INVALID_DATE
runTest('35. Strict Real Calendar Test 2: 2026-04-31T12:00:00Z -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2026-04-31T12:00:00Z',
    currentTime: '2026-01-01T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-1',
  });
  assert(!res.valid, 'April 31 must be rejected');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 36. Strict Real Calendar Test 3: 2028-02-29T12:00:00Z (Leap Year) -> valid
runTest('36. Strict Real Calendar Test 3: 2028-02-29T12:00:00Z (Leap Year) -> valid', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2028-02-29T12:00:00Z',
    currentTime: '2026-01-01T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-1',
  });
  assert(res.valid, '2028 Feb 29 (leap year) must be valid');
  assert(res.issueCode === null, 'issueCode must be null');
});

// 37. Strict Real Calendar Test 4: 2026-02-29T12:00:00Z (Non-Leap Year) -> INVALID_DATE
runTest('37. Strict Real Calendar Test 4: 2026-02-29T12:00:00Z (Non-Leap Year) -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2026-02-29T12:00:00Z',
    currentTime: '2026-01-01T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-1',
  });
  assert(!res.valid, '2026 Feb 29 (non-leap year) must be rejected');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 38. Strict Real Calendar Test 5: 2026-07-26T25:00:00Z (Hour 25) -> INVALID_DATE
runTest('38. Strict Real Calendar Test 5: 2026-07-26T25:00:00Z -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2026-07-26T25:00:00Z',
    currentTime: '2026-01-01T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-1',
  });
  assert(!res.valid, 'Hour 25 must be rejected');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 39. Strict Real Calendar Test 6: 2026-07-26T23:60:00Z (Minute 60) -> INVALID_DATE
runTest('39. Strict Real Calendar Test 6: 2026-07-26T23:60:00Z -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2026-07-26T23:60:00Z',
    currentTime: '2026-01-01T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-1',
  });
  assert(!res.valid, 'Minute 60 must be rejected');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 40. Strict Real Calendar Test 7: Invalid timezone offset (+25:00) -> INVALID_DATE
runTest('40. Strict Real Calendar Test 7: Invalid timezone offset (+25:00) -> INVALID_DATE', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2026-07-26T12:00:00+25:00',
    currentTime: '2026-01-01T12:00:00Z',
    confirmationIdempotencyKey: 'idemp-1',
  });
  assert(!res.valid, 'Offset +25:00 must be rejected');
  assert(res.issueCode === 'INVALID_DATE', 'issueCode must be INVALID_DATE');
});

// 41. New product added in compareCartSnapshot -> PRODUCT_ADDED
runTest('41. New product added in compareCartSnapshot -> PRODUCT_ADDED', () => {
  const res = compareCartSnapshot({
    previousSnapshot: [
      { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
    ],
    currentSnapshot: [
      { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      { productId: 'P2', quantity: 1, unitPriceSnapshotCents: 3000, productNameSnapshot: 'Kılıf' },
    ],
  });

  assert(res.changed, 'must be changed');
  assert(res.requiresCustomerReconfirmation, 'requiresCustomerReconfirmation must be true for PRODUCT_ADDED');
  assert(res.changes.includes('PRODUCT_ADDED'), 'changes must contain PRODUCT_ADDED');
  assert(!res.changes.includes('QUANTITY_CHANGED'), 'must not contain QUANTITY_CHANGED when quantity of existing item did not change');
});

// 42. Existing product quantity changed in compareCartSnapshot -> only QUANTITY_CHANGED
runTest('42. Existing product quantity changed -> only QUANTITY_CHANGED', () => {
  const res = compareCartSnapshot({
    previousSnapshot: [
      { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
    ],
    currentSnapshot: [
      { productId: 'P1', quantity: 2, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
    ],
  });

  assert(res.changed, 'must be changed');
  assert(res.requiresCustomerReconfirmation, 'requiresCustomerReconfirmation must be true');
  assert(res.changes.includes('QUANTITY_CHANGED'), 'changes must include QUANTITY_CHANGED');
  assert(!res.changes.includes('PRODUCT_ADDED'), 'must not contain PRODUCT_ADDED for quantity change');
});

// 43. Previous snapshot duplicate product -> reject
runTest('43. Previous snapshot duplicate product -> reject', () => {
  let threw = false;
  try {
    compareCartSnapshot({
      previousSnapshot: [
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      ],
      currentSnapshot: [
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('DUPLICATE_PREVIOUS_SNAPSHOT_PRODUCT');
  }
  assert(threw, 'Must throw DUPLICATE_PREVIOUS_SNAPSHOT_PRODUCT error');
});

// 44. Current snapshot duplicate product -> reject
runTest('44. Current snapshot duplicate product -> reject', () => {
  let threw = false;
  try {
    compareCartSnapshot({
      previousSnapshot: [
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      ],
      currentSnapshot: [
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
        { productId: 'P1', quantity: 1, unitPriceSnapshotCents: 5000, productNameSnapshot: 'Kablo' },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('DUPLICATE_CURRENT_SNAPSHOT_PRODUCT');
  }
  assert(threw, 'Must throw DUPLICATE_CURRENT_SNAPSHOT_PRODUCT error');
});

// 45. PAYMENT_SETUP_PENDING + paymentSetupStatus PENDING -> NOT_READY
runTest('45. PAYMENT_SETUP_PENDING + paymentSetupStatus PENDING -> NOT_READY', () => {
  const res = determineConversionReadiness({
    requestStatus: 'PAYMENT_SETUP_PENDING',
    reservationStatus: 'ACTIVE',
    reservationExpiresAt: '2030-01-01T00:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    latestOfferVersion: 'v1.0',
    confirmedOfferVersion: 'v1.0',
    customerConfirmed: true,
    stockRecheckPassed: true,
    priceRecheckPassed: true,
    paymentSetupStatus: 'PENDING',
    customerStatus: 'ACTIVE',
  });

  assert(!res.ready, 'must not be ready when paymentSetupStatus is PENDING');
  assert(res.targetStatus === 'NOT_READY', 'targetStatus must be NOT_READY');
  assert(res.blockingReasons.includes('PAYMENT_SETUP_NOT_READY'), 'must contain PAYMENT_SETUP_NOT_READY');
});

// 46. PAYMENT_SETUP_PENDING + paymentSetupStatus READY -> READY_FOR_CONVERSION
runTest('46. PAYMENT_SETUP_PENDING + paymentSetupStatus READY -> READY_FOR_CONVERSION', () => {
  const res = determineConversionReadiness({
    requestStatus: 'PAYMENT_SETUP_PENDING',
    reservationStatus: 'ACTIVE',
    reservationExpiresAt: '2030-01-01T00:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    latestOfferVersion: 'v1.0',
    confirmedOfferVersion: 'v1.0',
    customerConfirmed: true,
    stockRecheckPassed: true,
    priceRecheckPassed: true,
    paymentSetupStatus: 'READY',
    customerStatus: 'ACTIVE',
  });

  assert(res.ready, 'must be ready when paymentSetupStatus is READY');
  assert(res.targetStatus === 'READY_FOR_CONVERSION', 'targetStatus must be READY_FOR_CONVERSION');
  assert(res.blockingReasons.length === 0, 'must have no blocking reasons');
});

// 47. CONVERSION_PENDING -> INVALID_REQUEST_STATUS
runTest('47. CONVERSION_PENDING -> INVALID_REQUEST_STATUS', () => {
  const res = determineConversionReadiness({
    requestStatus: 'CONVERSION_PENDING',
    reservationStatus: 'ACTIVE',
    reservationExpiresAt: '2030-01-01T00:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    latestOfferVersion: 'v1.0',
    confirmedOfferVersion: 'v1.0',
    customerConfirmed: true,
    stockRecheckPassed: true,
    priceRecheckPassed: true,
    paymentSetupStatus: 'READY',
    customerStatus: 'ACTIVE',
  });

  assert(!res.ready, 'must not be ready');
  assert(res.blockingReasons.includes('INVALID_REQUEST_STATUS'), 'must contain INVALID_REQUEST_STATUS');
});

// 48. Unknown runtime status -> INVALID_REQUEST_STATUS
runTest('48. Unknown runtime status -> INVALID_REQUEST_STATUS', () => {
  const res = determineConversionReadiness({
    requestStatus: 'UNKNOWN_STATUS_ABC',
    reservationStatus: 'ACTIVE',
    reservationExpiresAt: '2030-01-01T00:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    latestOfferVersion: 'v1.0',
    confirmedOfferVersion: 'v1.0',
    customerConfirmed: true,
    stockRecheckPassed: true,
    priceRecheckPassed: true,
    paymentSetupStatus: 'READY',
    customerStatus: 'ACTIVE',
  });

  assert(!res.ready, 'must not be ready');
  assert(res.blockingReasons.includes('INVALID_REQUEST_STATUS'), 'must contain INVALID_REQUEST_STATUS');
});

// 49. Negative sellableStockSnapshot -> throws error
runTest('49. Negative sellableStockSnapshot -> throws error', () => {
  let threw = false;
  try {
    repriceCart({
      cartItems: [
        {
          productId: 'P1',
          quantity: 1,
          unitPriceSnapshotCents: 5000,
          productNameSnapshot: 'Kablo',
          sellableStockSnapshot: -5,
        },
      ],
      currentProducts: [
        {
          productId: 'P1',
          currentName: 'Kablo',
          currentSku: 'SKU1',
          currentUnitPriceCents: 5000,
          physicalStock: 10,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe non-negative integer');
  }
  assert(threw, 'Must throw error on negative sellableStockSnapshot');
});

// 50. Decimal sellableStockSnapshot -> throws error
runTest('50. Decimal sellableStockSnapshot -> throws error', () => {
  let threw = false;
  try {
    repriceCart({
      cartItems: [
        {
          productId: 'P1',
          quantity: 1,
          unitPriceSnapshotCents: 5000,
          productNameSnapshot: 'Kablo',
          sellableStockSnapshot: 3.5,
        },
      ],
      currentProducts: [
        {
          productId: 'P1',
          currentName: 'Kablo',
          currentSku: 'SKU1',
          currentUnitPriceCents: 5000,
          physicalStock: 10,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe non-negative integer');
  }
  assert(threw, 'Must throw error on decimal sellableStockSnapshot');
});

// 51. MAX_SAFE_INTEGER overflow on sellableStockSnapshot -> throws error
runTest('51. MAX_SAFE_INTEGER overflow on sellableStockSnapshot -> throws error', () => {
  let threw = false;
  try {
    repriceCart({
      cartItems: [
        {
          productId: 'P1',
          quantity: 1,
          unitPriceSnapshotCents: 5000,
          productNameSnapshot: 'Kablo',
          sellableStockSnapshot: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
      currentProducts: [
        {
          productId: 'P1',
          currentName: 'Kablo',
          currentSku: 'SKU1',
          currentUnitPriceCents: 5000,
          physicalStock: 10,
          activeReservedQuantity: 0,
          active: true,
          whatsappVisible: true,
        },
      ],
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe non-negative integer');
  }
  assert(threw, 'Must throw error on MAX_SAFE_INTEGER overflow on sellableStockSnapshot');
});

// 52. empty confirmation idempotency key -> reject
runTest('52. empty confirmation idempotency key -> reject', () => {
  const res = validateOfferConfirmation({
    confirmedOfferVersion: 'v1.0.0',
    latestOfferVersion: 'v1.0.0',
    expiresAt: '2030-01-01T00:00:00Z',
    currentTime: '2026-07-26T12:00:00Z',
    confirmationIdempotencyKey: '   ',
  });

  assert(!res.valid, 'must be invalid');
  assert(res.issueCode === 'INVALID_CONFIRMATION_KEY', 'issueCode must be INVALID_CONFIRMATION_KEY');
});

// 53. MAX_SAFE_INTEGER overflow on physical stock -> throws error
runTest('53. MAX_SAFE_INTEGER overflow on physical stock -> throws error', () => {
  let threw = false;
  try {
    calculateSellableStock({
      physicalStock: Number.MAX_SAFE_INTEGER + 10,
      activeReservedQuantity: 0,
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe non-negative integer');
  }
  assert(threw, 'Must throw error when physicalStock exceeds MAX_SAFE_INTEGER');
});

// Final Test Summary Report
console.log('\n=== TEST SUMMARY REPORT ===');
const failedTests = results.filter((r) => !r.passed);
console.log(`Total Tests Run: ${results.length}`);
console.log(`Passed: ${results.length - failedTests.length}`);
console.log(`Failed: ${failedTests.length}`);

if (failedTests.length > 0) {
  console.error('\nFAILED TESTS:');
  failedTests.forEach((f) => console.error(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\nALL PURE CATALOG ENGINE STRICT HARDENED TESTS PASSED SUCCESSFULLY! ✨');
}
