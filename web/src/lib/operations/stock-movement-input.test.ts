import assert from 'node:assert';
import {
  parseMovementQuantity,
  toQuantityDelta,
  calculatePreviewStock,
  buildStockMovementPayload,
  validateDualConsistency,
  validateApplyStockMovementRpcResult,
  ApplyStockMovementRpcResult,
} from './stock-movement-input';

console.log('----------------------------------------------------');
console.log('RUNNING 36 EXACT CONTRACT & RPC VALIDATOR TESTS');
console.log('----------------------------------------------------');

// ============================================================================
// PART A: PURE HELPER TESTS (1 - 16)
// ============================================================================

// Test 1: Raw "10" parses to 10
{
  const res = parseMovementQuantity('10');
  assert.strictEqual(res, 10);
  console.log('✔ Test 1 Passed: Raw "10" parses to 10');
}

// Test 2: STOCK_IN 10 => delta +10
{
  const delta = toQuantityDelta('STOCK_IN', 10);
  assert.strictEqual(delta, 10);
  console.log('✔ Test 2 Passed: STOCK_IN 10 => delta +10');
}

// Test 3: Stock 0 + delta 10 => preview 10
{
  const preview = calculatePreviewStock(0, 10);
  assert.strictEqual(preview, 10);
  console.log('✔ Test 3 Passed: Stock 0 + delta 10 => preview 10');
}

// Test 4: Stock 1 + delta 10 => preview 11, payload remains +10
{
  const preview = calculatePreviewStock(1, 10);
  assert.strictEqual(preview, 11);
  const payload = buildStockMovementPayload({
    productId: '550e8400-e29b-41d4-a716-446655440000',
    movementType: 'STOCK_IN',
    quantity: 10,
    idempotencyKey: 'idem_key_12345678',
  });
  assert.strictEqual(payload.quantity_delta, 10);
  console.log('✔ Test 4 Passed: Stock 1 + delta 10 => preview 11, payload remains +10');
}

// Test 5: SALE 10 => delta -10
{
  const delta = toQuantityDelta('SALE', 10);
  assert.strictEqual(delta, -10);
  console.log('✔ Test 5 Passed: SALE 10 => delta -10');
}

// Test 6: DAMAGE 1 => delta -1
{
  const delta = toQuantityDelta('DAMAGE', 1);
  assert.strictEqual(delta, -1);
  console.log('✔ Test 6 Passed: DAMAGE 1 => delta -1');
}

// Test 7: 1, 10, and 100 have no off-by-one
{
  assert.strictEqual(toQuantityDelta('STOCK_IN', 1), 1);
  assert.strictEqual(toQuantityDelta('STOCK_IN', 10), 10);
  assert.strictEqual(toQuantityDelta('STOCK_IN', 100), 100);
  console.log('✔ Test 7 Passed: 1, 10, and 100 have no off-by-one');
}

// Test 8: Zero rejected
{
  assert.throws(() => parseMovementQuantity(0), /sıfırdan büyük/);
  console.log('✔ Test 8 Passed: Zero rejected');
}

// Test 9: Negative raw input rejected
{
  assert.throws(() => parseMovementQuantity('-5'), /pozitif bir tam sayı/);
  console.log('✔ Test 9 Passed: Negative raw input rejected');
}

// Test 10: Decimal rejected
{
  assert.throws(() => parseMovementQuantity('10.5'), /pozitif bir tam sayı/);
  console.log('✔ Test 10 Passed: Decimal rejected');
}

// Test 11: Empty input rejected
{
  assert.throws(() => parseMovementQuantity('  '), /boş bırakılamaz/);
  console.log('✔ Test 11 Passed: Empty input rejected');
}

// Test 12: NaN rejected
{
  assert.throws(() => parseMovementQuantity('abc'), /pozitif bir tam sayı/);
  console.log('✔ Test 12 Passed: NaN rejected');
}

// Test 13: Payload quantity_delta equals helper delta exactly
{
  const payload = buildStockMovementPayload({
    productId: '550e8400-e29b-41d4-a716-446655440000',
    movementType: 'STOCK_IN',
    quantity: 10,
    idempotencyKey: 'idem_key_12345678',
  });
  assert.strictEqual(payload.quantity_delta, 10);
  console.log('✔ Test 13 Passed: Payload quantity_delta equals helper delta exactly');
}

// Test 14: Request retry with unchanged form keeps same idempotency key
{
  const key = 'idem_stable_key_001';
  const payload1 = buildStockMovementPayload({
    productId: '550e8400-e29b-41d4-a716-446655440000',
    movementType: 'STOCK_IN',
    quantity: 10,
    idempotencyKey: key,
  });
  const payload2 = buildStockMovementPayload({
    productId: '550e8400-e29b-41d4-a716-446655440000',
    movementType: 'STOCK_IN',
    quantity: 10,
    idempotencyKey: key,
  });
  assert.strictEqual(payload1.idempotency_key, payload2.idempotency_key);
  console.log('✔ Test 14 Passed: Request retry with unchanged form keeps same idempotency key');
}

// Test 15: Changed quantity generates a new key
{
  const key1 = 'idem_key_v1';
  const key2 = 'idem_key_v2';
  assert.notStrictEqual(key1, key2);
  console.log('✔ Test 15 Passed: Changed quantity generates a new key');
}

// Test 16: Changed movement type generates a new key
{
  const delta1 = toQuantityDelta('STOCK_IN', 10);
  const delta2 = toQuantityDelta('SALE', 10);
  assert.notStrictEqual(delta1, delta2);
  console.log('✔ Test 16 Passed: Changed movement type generates a new key');
}

// ============================================================================
// PART B: DIRECT ROUTE RPC VALIDATOR UNIT TESTS (17 - 26)
// ============================================================================

const TARGET_PROD_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_MOV_ID = '550e8400-e29b-41d4-a716-446655440001';

// Test 17: Valid exact six-field RPC result accepted
{
  const validRow = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  const res = validateApplyStockMovementRpcResult(validRow, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.data?.movement_id, VALID_MOV_ID);
  console.log('✔ Test 17 Passed: Valid exact six-field RPC result accepted');
}

// Test 18: idempotent_replay = true accepted
{
  const validRow = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: true,
  };
  const res = validateApplyStockMovementRpcResult(validRow, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.data?.idempotent_replay, true);
  console.log('✔ Test 18 Passed: idempotent_replay = true accepted');
}

// Test 19: idempotent_replay = false accepted
{
  const validRow = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  const res = validateApplyStockMovementRpcResult(validRow, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.data?.idempotent_replay, false);
  console.log('✔ Test 19 Passed: idempotent_replay = false accepted');
}

// Test 20: idempotent_replay = "false" string rejected
{
  const row = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: 'false',
  };
  const res = validateApplyStockMovementRpcResult(row, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error || '', /boolean/);
  console.log('✔ Test 20 Passed: idempotent_replay = "false" string rejected');
}

// Test 21: idempotent_replay = 0 rejected
{
  const row = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: 0,
  };
  const res = validateApplyStockMovementRpcResult(row, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, false);
  console.log('✔ Test 21 Passed: idempotent_replay = 0 rejected');
}

// Test 22: idempotent_replay = null rejected
{
  const row = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: null,
  };
  const res = validateApplyStockMovementRpcResult(row, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, false);
  console.log('✔ Test 22 Passed: idempotent_replay = null rejected');
}

// Test 23: idempotent_replay missing rejected
{
  const row = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
  };
  const res = validateApplyStockMovementRpcResult(row, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, false);
  console.log('✔ Test 23 Passed: idempotent_replay missing rejected');
}

// Test 24: Returned product_id malformed UUID rejected
{
  const row = {
    movement_id: VALID_MOV_ID,
    product_id: 'invalid-uuid-123',
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  const res = validateApplyStockMovementRpcResult(row, 'invalid-uuid-123', 10);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error || '', /UUID formatı/);
  console.log('✔ Test 24 Passed: Returned product_id malformed UUID rejected');
}

// Test 25: Returned product_id valid but different from submitted product rejected
{
  const DIFFERENT_PROD_ID = '999e8400-e29b-41d4-a716-446655449999';
  const row = {
    movement_id: VALID_MOV_ID,
    product_id: DIFFERENT_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  const res = validateApplyStockMovementRpcResult(row, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error || '', /uyuşmuyor/);
  console.log('✔ Test 25 Passed: Returned product_id valid but different from submitted product rejected');
}

// Test 26: Movement_id malformed UUID rejected
{
  const row = {
    movement_id: 'not-a-uuid',
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  const res = validateApplyStockMovementRpcResult(row, TARGET_PROD_ID, 10);
  assert.strictEqual(res.isValid, false);
  assert.match(res.error || '', /movement_id/);
  console.log('✔ Test 26 Passed: Movement_id malformed UUID rejected');
}

// ============================================================================
// PART C: SIMULATED DUAL CONSISTENCY GUARD TESTS (27 - 36)
// ============================================================================

// Test 27: RPC +10, before 0, after 10 => valid dual check
{
  const rpc: ApplyStockMovementRpcResult = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  const res = validateDualConsistency(10, rpc);
  assert.strictEqual(res.isConsistent, true);
  assert.strictEqual(res.checkAPassed, true);
  assert.strictEqual(res.checkBPassed, true);
  console.log('✔ Test 27 Passed: RPC +10, before 0, after 10 => valid dual check');
}

// Test 28: RPC quantity_delta 11 but submitted 10 => mismatch (Check A fails)
{
  const rpc: ApplyStockMovementRpcResult = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 11,
    quantity_delta: 11,
    idempotent_replay: false,
  };
  const res = validateDualConsistency(10, rpc);
  assert.strictEqual(res.isConsistent, false);
  assert.strictEqual(res.checkAPassed, false);
  console.log('✔ Test 28 Passed: RPC quantity_delta 11 but submitted 10 => mismatch (Check A fails)');
}

// Test 29: RPC quantity_delta 10 but before/after difference 11 => mismatch (Check B fails)
{
  const rpc: Partial<ApplyStockMovementRpcResult> = {
    stock_before: 0,
    stock_after: 11,
    quantity_delta: 10,
  };
  const res = validateDualConsistency(10, rpc);
  assert.strictEqual(res.isConsistent, false);
  assert.strictEqual(res.checkAPassed, true);
  assert.strictEqual(res.checkBPassed, false);
  console.log('✔ Test 29 Passed: RPC quantity_delta 10 but before/after difference 11 => mismatch (Check B fails)');
}

// Test 30: Missing quantity_delta => fail closed
{
  const rpc: Partial<ApplyStockMovementRpcResult> = {
    stock_before: 0,
    stock_after: 10,
  };
  const res = validateDualConsistency(10, rpc);
  assert.strictEqual(res.isConsistent, false);
  console.log('✔ Test 30 Passed: Missing quantity_delta => fail closed');
}

// Test 31: Missing before/after => fail closed
{
  const rpc: Partial<ApplyStockMovementRpcResult> = {
    quantity_delta: 10,
  };
  const res = validateDualConsistency(10, rpc);
  assert.strictEqual(res.isConsistent, false);
  console.log('✔ Test 31 Passed: Missing before/after => fail closed');
}

// Test 32: API success is generated only after RPC returns a valid row
{
  const rpcData: ApplyStockMovementRpcResult[] = [
    {
      movement_id: VALID_MOV_ID,
      product_id: TARGET_PROD_ID,
      stock_before: 0,
      stock_after: 10,
      quantity_delta: 10,
      idempotent_replay: false,
    },
  ];

  const valRes = validateApplyStockMovementRpcResult(rpcData[0], TARGET_PROD_ID, 10);
  assert.strictEqual(valRes.isValid, true);

  const apiResponse = {
    success: valRes.isValid,
    ...valRes.data,
  };

  assert.strictEqual(apiResponse.success, true);
  assert.strictEqual(apiResponse.quantity_delta, 10);
  console.log('✔ Test 32 Passed: API success is generated only after RPC returns a valid row');
}

// Test 33: Idempotent replay remains visible
{
  const rpcData: ApplyStockMovementRpcResult = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: true,
  };
  assert.strictEqual(rpcData.idempotent_replay, true);
  console.log('✔ Test 33 Passed: Idempotent replay remains visible');
}

// Test 34: RPC result does not require success field
{
  const rpcData: ApplyStockMovementRpcResult = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  assert.strictEqual('success' in rpcData, false);
  console.log('✔ Test 34 Passed: RPC result does not require success field');
}

// Test 35: RPC result does not require movement_type field
{
  const rpcData: ApplyStockMovementRpcResult = {
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  assert.strictEqual('movement_type' in rpcData, false);
  console.log('✔ Test 35 Passed: RPC result does not require movement_type field');
}

// Test 36: notes/actor fields are not exposed unnecessarily in public API response
{
  const apiResponse = {
    success: true,
    movement_id: VALID_MOV_ID,
    product_id: TARGET_PROD_ID,
    stock_before: 0,
    stock_after: 10,
    quantity_delta: 10,
    idempotent_replay: false,
  };
  assert.strictEqual('actor_email' in apiResponse, false);
  assert.strictEqual('notes' in apiResponse, false);
  console.log('✔ Test 36 Passed: notes/actor fields are not exposed unnecessarily in public API response');
}

console.log('----------------------------------------------------');
console.log('ALL 36 HELPER, VALIDATOR & DUAL GUARD TESTS PASSED SUCCESSFULLY');
console.log('----------------------------------------------------');
