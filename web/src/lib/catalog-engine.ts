import {
  CartChangeType,
  CartIssueCode,
  CartItemSnapshot,
  CartPricingResult,
  CartQuantityValidationResult,
  CartRepriceLine,
  CartSnapshotComparisonResult,
  ConversionBlockingReason,
  ConversionReadinessInput,
  ConversionReadinessResult,
  CurrentProductState,
  OfferConfirmationInput,
  OfferConfirmationResult,
} from './catalog-engine-types';

/**
 * Pure Catalog Stock, Cart & Offer Recheck Engine (Strict Hardened & Calendar Verified)
 *
 * IMPORTANT ARCHITECTURAL DIRECTIVES:
 * 1. Client cart totals and snapshot prices are NOT the source of truth.
 * 2. WhatsApp chat message text is NOT the source of truth.
 * 3. Live price is read strictly from server-side `public.products.price` (integer cents).
 * 4. Live sellable stock is computed server-side: physicalStock - activeReservedQuantity.
 * 5. Responsibilities:
 *    - `repriceCart` evaluates live product states (INSUFFICIENT_STOCK, PRODUCT_INACTIVE, CHANNEL_NOT_VISIBLE, PRICE_CHANGED).
 *    - `compareCartSnapshot` evaluates snapshot-to-snapshot structural & pricing differences (PRICE_CHANGED, QUANTITY_CHANGED, PRODUCT_ADDED, PRODUCT_REMOVED, METADATA_CHANGED).
 * 6. Date validation enforces strict RFC3339 format, real calendar day bounds, leap years, and timezone offset bounds.
 * 7. This module is pure TypeScript: NO veritabanı, NO side-effects, NO network I/O.
 */

const RFC3339_PARSER_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Validates strict RFC3339 date format, real calendar days, leap years, and timezone offsets.
 * Rejects silent JS Date.parse normalization (e.g., Feb 31, April 31, hour 25, minute 60, offset +25:00).
 */
export function isValidStrictRFC3339Date(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const str = dateStr.trim();
  const match = str.match(RFC3339_PARSER_REGEX);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);
  const tz = match[7];

  if (month < 1 || month > 12) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;

  if (tz !== 'Z') {
    const tzHour = parseInt(tz.substring(1, 3), 10);
    const tzMin = parseInt(tz.substring(4, 6), 10);
    if (tzHour < 0 || tzHour > 23) return false;
    if (tzMin < 0 || tzMin > 59) return false;
  }

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  let maxDays = 31;

  if (month === 4 || month === 6 || month === 9 || month === 11) {
    maxDays = 30;
  } else if (month === 2) {
    maxDays = isLeapYear ? 29 : 28;
  }

  if (day < 1 || day > maxDays) return false;

  const ts = Date.parse(str);
  if (Number.isNaN(ts)) return false;

  return true;
}

export function assertSafeNonNegativeInteger(value: unknown, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Number.isNaN(value) ||
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`Invalid ${name}: must be a safe non-negative integer`);
  }
  return value;
}

export function safeAddIntegers(a: number, b: number, name: string): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new Error(`Overflow in ${name}: sum exceeds safe integer limit`);
  }
  return sum;
}

export function safeSubtractIntegers(a: number, b: number, name: string): number {
  const diff = a - b;
  if (!Number.isSafeInteger(diff)) {
    throw new Error(`Underflow/Overflow in ${name}: result exceeds safe integer limit`);
  }
  return diff;
}

export function safeMultiplyIntegers(a: number, b: number, name: string): number {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new Error(`Overflow in ${name}: product exceeds safe integer limit`);
  }
  return product;
}

/**
 * 4. calculateSellableStock
 * Formül: sellableStock = physicalStock - activeReservedQuantity
 */
export function calculateSellableStock(params: {
  physicalStock: number;
  activeReservedQuantity: number;
}): number {
  const phys = assertSafeNonNegativeInteger(params.physicalStock, 'physicalStock');
  const res = assertSafeNonNegativeInteger(
    params.activeReservedQuantity,
    'activeReservedQuantity'
  );

  if (res > phys) {
    throw new Error(
      'Invalid stock state: activeReservedQuantity cannot exceed physicalStock'
    );
  }

  return safeSubtractIntegers(phys, res, 'sellableStock');
}

/**
 * 5. validateCartItemQuantity
 * Client-provided quantities are strictly validated against sellable stock and visibility.
 */
export function validateCartItemQuantity(params: {
  requestedQuantity: number;
  sellableStock: number;
  productActive: boolean;
  whatsappVisible: boolean;
}): CartQuantityValidationResult {
  const reqQty = params.requestedQuantity;
  if (
    typeof reqQty !== 'number' ||
    !Number.isFinite(reqQty) ||
    Number.isNaN(reqQty) ||
    !Number.isInteger(reqQty) ||
    !Number.isSafeInteger(reqQty) ||
    reqQty < 1
  ) {
    return {
      valid: false,
      allowedQuantity: 0,
      issueCode: 'INVALID_QUANTITY',
    };
  }

  const sellable = assertSafeNonNegativeInteger(params.sellableStock, 'sellableStock');

  if (!params.productActive) {
    return {
      valid: false,
      allowedQuantity: 0,
      issueCode: 'PRODUCT_INACTIVE',
    };
  }

  if (!params.whatsappVisible) {
    return {
      valid: false,
      allowedQuantity: 0,
      issueCode: 'CHANNEL_NOT_VISIBLE',
    };
  }

  if (sellable === 0) {
    return {
      valid: false,
      allowedQuantity: 0,
      issueCode: 'OUT_OF_STOCK',
    };
  }

  if (reqQty > sellable) {
    return {
      valid: false,
      allowedQuantity: sellable,
      issueCode: 'INSUFFICIENT_STOCK',
    };
  }

  return {
    valid: true,
    allowedQuantity: reqQty,
    issueCode: null,
  };
}

/**
 * 6. repriceCart
 * Reprices cart items against server-side current product states.
 * Uses integer cents (TRY).
 */
export function repriceCart(params: {
  cartItems: CartItemSnapshot[];
  currentProducts: CurrentProductState[];
  currency?: string;
  calculationVersion?: string;
}): CartPricingResult {
  const currency = params.currency ?? 'TRY';
  if (currency !== 'TRY') {
    throw new Error(`Unsupported currency: ${currency}. Only TRY is supported`);
  }

  const calcVersion = params.calculationVersion ?? 'v1.0.0';

  if (!Array.isArray(params.cartItems)) {
    throw new Error('Invalid cartItems: must be an array');
  }
  if (!Array.isArray(params.currentProducts)) {
    throw new Error('Invalid currentProducts: must be an array');
  }

  // Build productMap and strictly reject duplicate currentProducts entries
  const productMap = new Map<string, CurrentProductState>();
  for (const prod of params.currentProducts) {
    if (!prod.productId || typeof prod.productId !== 'string' || prod.productId.trim() === '') {
      throw new Error('Invalid productId in currentProducts');
    }
    const pid = prod.productId.trim();
    if (productMap.has(pid)) {
      throw new Error(`Duplicate productId in currentProducts: DUPLICATE_CURRENT_PRODUCT (${pid})`);
    }
    assertSafeNonNegativeInteger(prod.currentUnitPriceCents, 'currentUnitPriceCents');
    productMap.set(pid, prod);
  }

  const seenProductIds = new Set<string>();
  const lines: CartRepriceLine[] = [];
  const fatalIssues = new Set<CartIssueCode>();
  const allIssues = new Set<CartIssueCode>();
  let validLinesSubtotalCents = 0;
  let requiresCustomerReconfirmation = false;
  let cartValid = true;

  let pricedLineCount = 0;
  let invalidLineCount = 0;

  for (const item of params.cartItems) {
    if (!item.productId || typeof item.productId !== 'string' || item.productId.trim() === '') {
      throw new Error('Invalid productId in cartItems');
    }

    const pid = item.productId.trim();

    let previousSellableStock: number | null = null;
    if (item.sellableStockSnapshot !== undefined && item.sellableStockSnapshot !== null) {
      previousSellableStock = assertSafeNonNegativeInteger(
        item.sellableStockSnapshot,
        'sellableStockSnapshot'
      );
    }

    if (seenProductIds.has(pid)) {
      cartValid = false;
      invalidLineCount = safeAddIntegers(invalidLineCount, 1, 'invalidLineCount');
      fatalIssues.add('DUPLICATE_CART_ITEM');
      allIssues.add('DUPLICATE_CART_ITEM');
      lines.push({
        productId: pid,
        currentName: item.productNameSnapshot || pid,
        requestedQuantity: typeof item.quantity === 'number' && Number.isSafeInteger(item.quantity) ? item.quantity : 0,
        currentUnitPriceCents: 0,
        lineTotalCents: 0,
        previousSellableStock,
        currentSellableStock: 0,
        stockChanged: false,
        valid: false,
        issueCodes: ['DUPLICATE_CART_ITEM'],
        previousUnitPriceCents: item.unitPriceSnapshotCents || 0,
        priceChanged: false,
        metadataChanged: false,
      });
      continue;
    }
    seenProductIds.add(pid);

    const currentProd = productMap.get(pid);

    if (!currentProd) {
      cartValid = false;
      invalidLineCount = safeAddIntegers(invalidLineCount, 1, 'invalidLineCount');
      fatalIssues.add('PRODUCT_NOT_FOUND');
      allIssues.add('PRODUCT_NOT_FOUND');
      lines.push({
        productId: pid,
        currentName: item.productNameSnapshot || pid,
        requestedQuantity: typeof item.quantity === 'number' && Number.isSafeInteger(item.quantity) ? item.quantity : 0,
        currentUnitPriceCents: 0,
        lineTotalCents: 0,
        previousSellableStock,
        currentSellableStock: 0,
        stockChanged: false,
        valid: false,
        issueCodes: ['PRODUCT_NOT_FOUND'],
        previousUnitPriceCents: item.unitPriceSnapshotCents || 0,
        priceChanged: false,
        metadataChanged: false,
      });
      continue;
    }

    const currentSellableStock = calculateSellableStock({
      physicalStock: currentProd.physicalStock,
      activeReservedQuantity: currentProd.activeReservedQuantity,
    });

    const stockChanged =
      previousSellableStock !== null && previousSellableStock !== currentSellableStock;

    const qtyVal = validateCartItemQuantity({
      requestedQuantity: item.quantity,
      sellableStock: currentSellableStock,
      productActive: currentProd.active,
      whatsappVisible: currentProd.whatsappVisible,
    });

    const lineIssues: CartIssueCode[] = [];
    if (!qtyVal.valid && qtyVal.issueCode) {
      lineIssues.push(qtyVal.issueCode);
      fatalIssues.add(qtyVal.issueCode);
      allIssues.add(qtyVal.issueCode);
    }

    const prevPrice = assertSafeNonNegativeInteger(
      item.unitPriceSnapshotCents,
      'unitPriceSnapshotCents'
    );
    const currPrice = currentProd.currentUnitPriceCents;

    const priceChanged = prevPrice !== currPrice;
    if (priceChanged) {
      lineIssues.push('PRICE_CHANGED');
      fatalIssues.add('PRICE_CHANGED');
      allIssues.add('PRICE_CHANGED');
      requiresCustomerReconfirmation = true;
    }

    const nameChanged = item.productNameSnapshot && (item.productNameSnapshot || '').trim() !== (currentProd.currentName || '').trim();
    const skuChanged = item.skuSnapshot && (item.skuSnapshot || '').trim() !== (currentProd.currentSku || '').trim();
    const metadataChanged = Boolean(nameChanged || skuChanged);
    if (metadataChanged) {
      lineIssues.push('METADATA_CHANGED');
      allIssues.add('METADATA_CHANGED');
    }

    const lineValid = qtyVal.valid && !priceChanged;
    if (lineValid) {
      pricedLineCount = safeAddIntegers(pricedLineCount, 1, 'pricedLineCount');
    } else {
      cartValid = false;
      invalidLineCount = safeAddIntegers(invalidLineCount, 1, 'invalidLineCount');
    }

    let lineTotalCents = 0;
    if (qtyVal.valid) {
      lineTotalCents = safeMultiplyIntegers(
        item.quantity,
        currPrice,
        `lineTotalCents (${pid})`
      );
      validLinesSubtotalCents = safeAddIntegers(
        validLinesSubtotalCents,
        lineTotalCents,
        'validLinesSubtotalCents'
      );
    }

    lines.push({
      productId: pid,
      currentName: currentProd.currentName,
      requestedQuantity: item.quantity,
      currentUnitPriceCents: currPrice,
      lineTotalCents,
      previousSellableStock,
      currentSellableStock,
      stockChanged,
      valid: lineValid,
      issueCodes: lineIssues,
      previousUnitPriceCents: prevPrice,
      priceChanged,
      metadataChanged,
    });
  }

  const isOverallValid = cartValid && fatalIssues.size === 0;

  return {
    valid: isOverallValid,
    currency,
    lines,
    validLinesSubtotalCents,
    orderTotalCents: isOverallValid ? validLinesSubtotalCents : null,
    totalLineCount: params.cartItems.length,
    pricedLineCount,
    invalidLineCount,
    issues: Array.from(allIssues),
    requiresCustomerReconfirmation,
    calculationVersion: calcVersion,
  };
}

/**
 * 7. compareCartSnapshot
 * Detects structural and pricing differences between previous and current cart snapshots.
 * Distinguishes brand-new products added (`PRODUCT_ADDED`) from existing product quantity changes (`QUANTITY_CHANGED`).
 */
export function compareCartSnapshot(params: {
  previousSnapshot: CartItemSnapshot[];
  currentSnapshot: CartItemSnapshot[];
}): CartSnapshotComparisonResult {
  const prevList = params.previousSnapshot || [];
  const currList = params.currentSnapshot || [];

  const prevMap = new Map<string, CartItemSnapshot>();
  let previousTotalCents = 0;
  for (let i = 0; i < prevList.length; i++) {
    const item = prevList[i];
    if (!item.productId || typeof item.productId !== 'string' || item.productId.trim() === '') {
      throw new Error('Invalid productId in previousSnapshot');
    }
    const pid = item.productId.trim();
    if (prevMap.has(pid)) {
      throw new Error(`Duplicate productId in previousSnapshot: DUPLICATE_PREVIOUS_SNAPSHOT_PRODUCT (${pid})`);
    }
    assertSafeNonNegativeInteger(item.unitPriceSnapshotCents, 'previous item price');
    assertSafeNonNegativeInteger(item.quantity, 'previous item quantity');
    prevMap.set(pid, item);
    const lineTotal = safeMultiplyIntegers(
      item.quantity,
      item.unitPriceSnapshotCents,
      'prev line total'
    );
    previousTotalCents = safeAddIntegers(previousTotalCents, lineTotal, 'previousTotalCents');
  }

  const currMap = new Map<string, CartItemSnapshot>();
  let currentTotalCents = 0;
  for (let i = 0; i < currList.length; i++) {
    const item = currList[i];
    if (!item.productId || typeof item.productId !== 'string' || item.productId.trim() === '') {
      throw new Error('Invalid productId in currentSnapshot');
    }
    const pid = item.productId.trim();
    if (currMap.has(pid)) {
      throw new Error(`Duplicate productId in currentSnapshot: DUPLICATE_CURRENT_SNAPSHOT_PRODUCT (${pid})`);
    }
    assertSafeNonNegativeInteger(item.unitPriceSnapshotCents, 'current item price');
    assertSafeNonNegativeInteger(item.quantity, 'current item quantity');
    currMap.set(pid, item);
    const lineTotal = safeMultiplyIntegers(
      item.quantity,
      item.unitPriceSnapshotCents,
      'curr line total'
    );
    currentTotalCents = safeAddIntegers(currentTotalCents, lineTotal, 'currentTotalCents');
  }

  const changesSet = new Set<CartChangeType>();
  let requiresCustomerReconfirmation = false;

  // Check removed products
  prevMap.forEach((_prevItem, pid) => {
    if (!currMap.has(pid)) {
      changesSet.add('PRODUCT_REMOVED');
    }
  });

  // Check added or modified products
  currMap.forEach((currItem, pid) => {
    const prevItem = prevMap.get(pid);
    if (!prevItem) {
      // Brand-new product added to current snapshot
      changesSet.add('PRODUCT_ADDED');
      requiresCustomerReconfirmation = true;
      return;
    }

    if (prevItem.quantity !== currItem.quantity) {
      changesSet.add('QUANTITY_CHANGED');
      requiresCustomerReconfirmation = true;
    }

    if (prevItem.unitPriceSnapshotCents !== currItem.unitPriceSnapshotCents) {
      changesSet.add('PRICE_CHANGED');
      requiresCustomerReconfirmation = true;
    }

    if (
      (prevItem.productNameSnapshot || '').trim() !== (currItem.productNameSnapshot || '').trim() ||
      (prevItem.skuSnapshot || '').trim() !== (currItem.skuSnapshot || '').trim()
    ) {
      changesSet.add('METADATA_CHANGED');
    }
  });

  if (changesSet.size === 0) {
    changesSet.add('UNCHANGED');
  } else if (changesSet.size > 1) {
    changesSet.add('MULTIPLE_CHANGES');
  }

  const changesArray = Array.from(changesSet);

  return {
    changed: changesArray.length > 0 && !changesArray.includes('UNCHANGED'),
    requiresCustomerReconfirmation,
    changes: changesArray,
    previousTotalCents,
    currentTotalCents,
  };
}

/**
 * 8. validateOfferConfirmation
 * Validates offer version, strict RFC3339 real calendar expiration date, and idempotency key.
 */
export function validateOfferConfirmation(
  input: OfferConfirmationInput
): OfferConfirmationResult {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: OfferConfirmationInput object is required');
  }

  if (
    typeof input.confirmationIdempotencyKey !== 'string' ||
    input.confirmationIdempotencyKey.trim() === ''
  ) {
    return { valid: false, issueCode: 'INVALID_CONFIRMATION_KEY' };
  }

  if (
    typeof input.confirmedOfferVersion !== 'string' ||
    input.confirmedOfferVersion.trim() === ''
  ) {
    return { valid: false, issueCode: 'INVALID_OFFER_VERSION' };
  }

  if (
    typeof input.latestOfferVersion !== 'string' ||
    input.latestOfferVersion.trim() === ''
  ) {
    return { valid: false, issueCode: 'INVALID_OFFER_VERSION' };
  }

  if (input.confirmedOfferVersion.trim() !== input.latestOfferVersion.trim()) {
    return { valid: false, issueCode: 'STALE_OFFER_VERSION' };
  }

  // Strict RFC3339 real calendar date check (with leap year and day/hour/minute/offset validation)
  if (
    !isValidStrictRFC3339Date(input.expiresAt) ||
    !isValidStrictRFC3339Date(input.currentTime)
  ) {
    return { valid: false, issueCode: 'INVALID_DATE' };
  }

  const expTime = Date.parse(input.expiresAt.trim());
  const currTime = Date.parse(input.currentTime.trim());

  if (expTime <= currTime) {
    return { valid: false, issueCode: 'OFFER_EXPIRED' };
  }

  return { valid: true, issueCode: null };
}

/**
 * 9. determineConversionReadiness
 * Evaluates whether all conditions for READY_FOR_CONVERSION are satisfied.
 */
export function determineConversionReadiness(
  input: ConversionReadinessInput
): ConversionReadinessResult {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: ConversionReadinessInput object is required');
  }

  const blockingReasons: ConversionBlockingReason[] = [];

  const validPrevStatuses = [
    'CUSTOMER_CONFIRMED',
    'PAYMENT_SETUP_PENDING',
    'READY_FOR_CONVERSION',
  ];
  if (!validPrevStatuses.includes(input.requestStatus)) {
    blockingReasons.push('INVALID_REQUEST_STATUS');
  }

  if (input.reservationStatus !== 'ACTIVE') {
    blockingReasons.push('RESERVATION_NOT_ACTIVE');
  }

  if (
    !isValidStrictRFC3339Date(input.reservationExpiresAt) ||
    !isValidStrictRFC3339Date(input.currentTime)
  ) {
    blockingReasons.push('RESERVATION_EXPIRED');
  } else {
    const expTime = Date.parse(input.reservationExpiresAt.trim());
    const currTime = Date.parse(input.currentTime.trim());
    if (expTime <= currTime) {
      blockingReasons.push('RESERVATION_EXPIRED');
    }
  }

  if (!input.customerConfirmed) {
    blockingReasons.push('CUSTOMER_NOT_CONFIRMED');
  }

  if (
    !input.confirmedOfferVersion ||
    !input.latestOfferVersion ||
    input.confirmedOfferVersion.trim() !== input.latestOfferVersion.trim()
  ) {
    blockingReasons.push('STALE_OFFER_VERSION');
  }

  if (!input.stockRecheckPassed) {
    blockingReasons.push('STOCK_RECHECK_FAILED');
  }

  if (!input.priceRecheckPassed) {
    blockingReasons.push('PRICE_RECHECK_FAILED');
  }

  if (input.paymentSetupStatus !== 'READY') {
    blockingReasons.push('PAYMENT_SETUP_NOT_READY');
  }

  if (input.customerStatus !== 'ACTIVE') {
    blockingReasons.push('CUSTOMER_NOT_ACTIVE');
  }

  const ready = blockingReasons.length === 0;

  return {
    ready,
    targetStatus: ready ? 'READY_FOR_CONVERSION' : 'NOT_READY',
    blockingReasons,
  };
}
