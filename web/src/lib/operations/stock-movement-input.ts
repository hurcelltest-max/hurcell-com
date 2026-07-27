export type AllowedMovementType =
  | 'STOCK_IN'
  | 'SALE'
  | 'RETURN'
  | 'DAMAGE'
  | 'INTERNAL_USE'
  | 'PRINT_MATERIAL_USE';

export interface StockMovementPayloadInput {
  productId: string;
  movementType: AllowedMovementType;
  quantity: number;
  idempotencyKey: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface StockMovementPayload {
  product_id: string;
  movement_type: AllowedMovementType;
  quantity_delta: number;
  reference_type: string;
  reference_id: string | null;
  idempotency_key: string;
  notes?: string;
}

/**
 * Exact canonical type representing the 6 columns returned by production public.apply_stock_movement RPC.
 */
export interface ApplyStockMovementRpcResult {
  movement_id: string;
  product_id: string;
  stock_before: number;
  stock_after: number;
  quantity_delta: number;
  idempotent_replay: boolean;
}

/**
 * Dual Consistency Check Result:
 * Check A: submitted_delta === rpc.quantity_delta
 * Check B: rpc.stock_after - rpc.stock_before === rpc.quantity_delta
 */
export interface DualConsistencyResult {
  isConsistent: boolean;
  actualDelta: number;
  checkAPassed: boolean;
  checkBPassed: boolean;
  failureReason?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RpcValidationResult {
  isValid: boolean;
  data?: ApplyStockMovementRpcResult;
  error?: string;
}

/**
 * Pure validator function for apply_stock_movement RPC response.
 * Enforces:
 * - Exactly one object row
 * - movement_id is valid UUID
 * - product_id is valid UUID and matches expectedProductId exactly
 * - stock_before is integer
 * - stock_after is integer
 * - quantity_delta is integer and equals expectedDelta if provided
 * - idempotent_replay is strictly boolean (typeof === 'boolean')
 */
export function validateApplyStockMovementRpcResult(
  row: unknown,
  expectedProductId: string,
  expectedDelta?: number
): RpcValidationResult {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { isValid: false, error: 'RPC yanıt nesnesi bulunamadı veya geçersiz formatta.' };
  }

  const record = row as Record<string, unknown>;

  const movementId = String(record.movement_id || '');
  if (!movementId || !UUID_REGEX.test(movementId)) {
    return { isValid: false, error: 'Geçersiz veya eksik movement_id UUID formatı.' };
  }

  const productId = String(record.product_id || '');
  if (!productId || !UUID_REGEX.test(productId)) {
    return { isValid: false, error: 'Geçersiz veya eksik product_id UUID formatı.' };
  }

  if (productId.toLowerCase() !== expectedProductId.trim().toLowerCase()) {
    return { isValid: false, error: `RPC yanıtındaki product_id (${productId}) istenen ürün kimliği (${expectedProductId}) ile uyuşmuyor.` };
  }

  if (typeof record.idempotent_replay !== 'boolean') {
    return { isValid: false, error: 'idempotent_replay alanı kesin olarak boolean tipinde olmalıdır.' };
  }

  const stockBefore = typeof record.stock_before === 'number' ? record.stock_before : parseInt(String(record.stock_before), 10);
  const stockAfter = typeof record.stock_after === 'number' ? record.stock_after : parseInt(String(record.stock_after), 10);
  const quantityDelta = typeof record.quantity_delta === 'number' ? record.quantity_delta : parseInt(String(record.quantity_delta), 10);

  if (!Number.isInteger(stockBefore) || !Number.isInteger(stockAfter) || !Number.isInteger(quantityDelta)) {
    return { isValid: false, error: 'RPC yanıtındaki stok ve delta alanları geçerli tamsayılar olmalıdır.' };
  }

  if (expectedDelta !== undefined && quantityDelta !== expectedDelta) {
    return { isValid: false, error: `RPC yanıtındaki quantity_delta (${quantityDelta}) gönderilen delta (${expectedDelta}) ile uyuşmuyor.` };
  }

  return {
    isValid: true,
    data: {
      movement_id: movementId,
      product_id: productId,
      stock_before: stockBefore,
      stock_after: stockAfter,
      quantity_delta: quantityDelta,
      idempotent_replay: record.idempotent_replay,
    },
  };
}

/**
 * Executes dual consistency validation on submitted delta vs server RPC return.
 */
export function validateDualConsistency(
  submittedDelta: number,
  rpcResult: Partial<ApplyStockMovementRpcResult> | null | undefined
): DualConsistencyResult {
  if (!rpcResult || typeof rpcResult !== 'object') {
    return {
      isConsistent: false,
      actualDelta: NaN,
      checkAPassed: false,
      checkBPassed: false,
      failureReason: 'RPC yanıt verisi eksik veya geçersiz.',
    };
  }

  const { stock_before, stock_after, quantity_delta } = rpcResult;

  if (
    typeof stock_before !== 'number' ||
    typeof stock_after !== 'number' ||
    typeof quantity_delta !== 'number' ||
    isNaN(stock_before) ||
    isNaN(stock_after) ||
    isNaN(quantity_delta)
  ) {
    return {
      isConsistent: false,
      actualDelta: NaN,
      checkAPassed: false,
      checkBPassed: false,
      failureReason: 'RPC yanıtındaki stok veya delta alanları sayısal değil.',
    };
  }

  const checkAPassed = submittedDelta === quantity_delta;
  const actualDelta = stock_after - stock_before;
  const checkBPassed = actualDelta === quantity_delta;
  const isConsistent = checkAPassed && checkBPassed;

  let failureReason: string | undefined = undefined;
  if (!checkAPassed) {
    failureReason = `Gönderilen delta (${submittedDelta}) ile sunucu RPC deltas (${quantity_delta}) uyuşmuyor.`;
  } else if (!checkBPassed) {
    failureReason = `Sunucu stok farkı (${actualDelta}) ile sunucu deltas (${quantity_delta}) uyuşmuyor.`;
  }

  return {
    isConsistent,
    actualDelta,
    checkAPassed,
    checkBPassed,
    failureReason,
  };
}

/**
 * Parses raw input into a strict positive integer.
 * Rejects 0, negative values, decimals, empty strings, and NaN.
 */
export function parseMovementQuantity(raw: string | number): number {
  if (raw === null || raw === undefined) {
    throw new Error('Miktar boş bırakılamaz.');
  }

  const str = String(raw).trim();
  if (str === '') {
    throw new Error('Miktar alanı boş bırakılamaz.');
  }

  // Reject non-integer format strings like "10.5", "10,5", "1e3"
  if (!/^[0-9]+$/.test(str)) {
    throw new Error('Miktar pozitif bir tam sayı olmalıdır.');
  }

  const num = Number(str);
  if (!Number.isInteger(num) || isNaN(num)) {
    throw new Error('Miktar geçerli bir tam sayı olmalıdır.');
  }

  if (num <= 0) {
    throw new Error('Miktar sıfırdan büyük olmalıdır.');
  }

  if (num > 1_000_000) {
    throw new Error('Miktar tek seferde 1.000.000 adedi aşamaz.');
  }

  return num;
}

/**
 * Maps movement type and positive quantity to exact signed delta.
 * STOCK_IN / RETURN => +quantity
 * SALE / DAMAGE / INTERNAL_USE / PRINT_MATERIAL_USE => -quantity
 */
export function toQuantityDelta(movementType: AllowedMovementType, quantity: number): number {
  const cleanQty = parseMovementQuantity(quantity);

  switch (movementType) {
    case 'STOCK_IN':
    case 'RETURN':
      return cleanQty;
    case 'SALE':
    case 'DAMAGE':
    case 'INTERNAL_USE':
    case 'PRINT_MATERIAL_USE':
      return -cleanQty;
    default:
      throw new Error(`Desteklenmeyen hareket tipi: ${movementType}`);
  }
}

/**
 * Computes projected stock from current stock and signed delta.
 */
export function calculatePreviewStock(currentStock: number, delta: number): number {
  if (typeof currentStock !== 'number' || isNaN(currentStock)) {
    throw new Error('Geçersiz mevcut stok değeri.');
  }
  if (typeof delta !== 'number' || isNaN(delta)) {
    throw new Error('Geçersiz stok değişim değeri.');
  }
  return currentStock + delta;
}

/**
 * Builds safe structured JSON payload for POST request.
 */
export function buildStockMovementPayload(input: StockMovementPayloadInput): StockMovementPayload {
  const delta = toQuantityDelta(input.movementType, input.quantity);

  if (!input.productId || typeof input.productId !== 'string' || input.productId.trim() === '') {
    throw new Error('Geçersiz ürün kimliği.');
  }

  if (!input.idempotencyKey || typeof input.idempotencyKey !== 'string' || input.idempotencyKey.trim().length < 8) {
    throw new Error('Geçersiz veya eksik idempotency anahtarı.');
  }

  const payload: StockMovementPayload = {
    product_id: input.productId.trim(),
    movement_type: input.movementType,
    quantity_delta: delta,
    reference_type: input.referenceType ? input.referenceType.trim() : 'MANUAL_OPERATIONS',
    reference_id: input.referenceId ? input.referenceId.trim() : null,
    idempotency_key: input.idempotencyKey.trim(),
  };

  if (input.notes && input.notes.trim() !== '') {
    payload.notes = input.notes.trim().slice(0, 500);
  }

  return payload;
}
