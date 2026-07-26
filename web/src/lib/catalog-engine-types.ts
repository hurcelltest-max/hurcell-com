export interface CatalogProductSnapshot {
  productId: string;
  sku: string | null;
  name: string;
  unitPriceCents: number;
  physicalStock: number;
  activeReservedQuantity: number;
  active: boolean;
  whatsappVisible: boolean;
  stockVersion?: string | null;
  priceVersion?: string | null;
  updatedAt?: string | null;
}

export interface CartItemSnapshot {
  productId: string;
  quantity: number;
  unitPriceSnapshotCents: number;
  productNameSnapshot: string;
  skuSnapshot?: string | null;
  sellableStockSnapshot?: number | null; // Previous snapshot view, NOT source of truth
  stockVersionSnapshot?: string | null;
  priceVersionSnapshot?: string | null;
}

export interface CurrentProductState {
  productId: string;
  currentName: string;
  currentSku: string | null;
  currentUnitPriceCents: number;
  physicalStock: number;
  activeReservedQuantity: number;
  active: boolean;
  whatsappVisible: boolean;
  stockVersion?: string | null;
  priceVersion?: string | null;
}

export type CartIssueCode =
  | 'INVALID_QUANTITY'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_INACTIVE'
  | 'CHANNEL_NOT_VISIBLE'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_CHANGED'
  | 'METADATA_CHANGED'
  | 'DUPLICATE_CART_ITEM'
  | 'DUPLICATE_CURRENT_PRODUCT';

export interface CartQuantityValidationResult {
  valid: boolean;
  allowedQuantity: number;
  issueCode: CartIssueCode | null;
}

export interface CartRepriceLine {
  productId: string;
  currentName: string;
  requestedQuantity: number;
  currentUnitPriceCents: number;
  lineTotalCents: number;
  previousSellableStock: number | null;
  currentSellableStock: number;
  stockChanged: boolean;
  valid: boolean;
  issueCodes: CartIssueCode[];
  previousUnitPriceCents: number;
  priceChanged: boolean;
  metadataChanged: boolean;
}

export interface CartPricingResult {
  valid: boolean;
  currency: string;
  lines: CartRepriceLine[];
  validLinesSubtotalCents: number;
  orderTotalCents: number | null; // Null when valid === false to prevent using invalid cart total
  totalLineCount: number;
  pricedLineCount: number;
  invalidLineCount: number;
  issues: CartIssueCode[];
  requiresCustomerReconfirmation: boolean;
  calculationVersion: string;
}

/**
 * Changes supported exclusively by compareCartSnapshot (snapshot-to-snapshot differences).
 * Note: Live product state changes (PRODUCT_INACTIVE, CHANNEL_NOT_VISIBLE, STOCK_CHANGED)
 * are evaluated exclusively during repriceCart against CurrentProductState.
 */
export type CartChangeType =
  | 'UNCHANGED'
  | 'PRICE_CHANGED'
  | 'QUANTITY_CHANGED'
  | 'PRODUCT_ADDED'
  | 'PRODUCT_REMOVED'
  | 'METADATA_CHANGED'
  | 'MULTIPLE_CHANGES';

export interface CartSnapshotComparisonResult {
  changed: boolean;
  requiresCustomerReconfirmation: boolean;
  changes: CartChangeType[];
  previousTotalCents: number;
  currentTotalCents: number;
}

export interface OfferConfirmationInput {
  confirmedOfferVersion: string;
  latestOfferVersion: string;
  expiresAt: string;
  currentTime: string;
  confirmationIdempotencyKey: string;
}

export type OfferConfirmationIssueCode =
  | 'INVALID_OFFER_VERSION'
  | 'STALE_OFFER_VERSION'
  | 'OFFER_EXPIRED'
  | 'INVALID_CONFIRMATION_KEY'
  | 'INVALID_DATE';

export interface OfferConfirmationResult {
  valid: boolean;
  issueCode: OfferConfirmationIssueCode | null;
}

export type PaymentSetupStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'READY'
  | 'FAILED'
  | 'EXPIRED';

export type PaymentMethod = 'CASH' | 'CARD' | 'HURCELL_LIMIT' | 'MIXED';

export interface ConversionReadinessInput {
  requestStatus: string;
  reservationStatus: string;
  reservationExpiresAt: string;
  currentTime: string;
  latestOfferVersion: string;
  confirmedOfferVersion: string;
  customerConfirmed: boolean;
  stockRecheckPassed: boolean;
  priceRecheckPassed: boolean;
  paymentSetupStatus: PaymentSetupStatus;
  customerStatus: string;
}

export type ConversionBlockingReason =
  | 'INVALID_REQUEST_STATUS'
  | 'RESERVATION_NOT_ACTIVE'
  | 'RESERVATION_EXPIRED'
  | 'CUSTOMER_NOT_CONFIRMED'
  | 'STALE_OFFER_VERSION'
  | 'STOCK_RECHECK_FAILED'
  | 'PRICE_RECHECK_FAILED'
  | 'PAYMENT_SETUP_NOT_READY'
  | 'CUSTOMER_NOT_ACTIVE';

export interface ConversionReadinessResult {
  ready: boolean;
  targetStatus: 'READY_FOR_CONVERSION' | 'NOT_READY';
  blockingReasons: ConversionBlockingReason[];
}
