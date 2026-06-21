import assert from 'node:assert';
import { calculateNewPrice } from '../src/lib/priceMath';

console.log('--- RUNNING PRICEMATH AUTOMATED TESTS ---');

try {
  // Test 1: 1.005 -> 1.01 (Rounding half up)
  const t1 = calculateNewPrice(1.005, 'flat_increase', 0, 'none');
  assert.strictEqual(t1, 1.01, `Expected 1.005 -> 1.01, got ${t1}`);
  console.log('✓ Test 1: 1.005 -> 1.01 (none rounding)');

  // Test 2: 2.675 -> 2.68 (Rounding half up)
  const t2 = calculateNewPrice(2.675, 'flat_increase', 0, 'none');
  assert.strictEqual(t2, 2.68, `Expected 2.675 -> 2.68, got ${t2}`);
  console.log('✓ Test 2: 2.675 -> 2.68 (none rounding)');

  // Test 3: 0.1 + 0.2 -> 0.30
  const t3 = calculateNewPrice(0.1, 'flat_increase', 0.2, 'none');
  assert.strictEqual(t3, 0.30, `Expected 0.1 + 0.2 -> 0.30, got ${t3}`);
  console.log('✓ Test 3: 0.1 + 0.2 -> 0.30');

  // Test 4: 19.99 × 35.1234 -> 702.12
  const t4 = calculateNewPrice(19.99, 'currency_update', 0, 'none', 35.1234);
  assert.strictEqual(t4, 702.12, `Expected 19.99 * 35.1234 -> 702.12, got ${t4}`);
  console.log('✓ Test 4: 19.99 * 35.1234 -> 702.12');

  // Test 5: 124, sonu 9,90 -> 129.90
  const t5 = calculateNewPrice(124, 'flat_increase', 0, 'sonu_9_90');
  assert.strictEqual(t5, 129.90, `Expected 124 -> 129.90 with sonu_9_90, got ${t5}`);
  console.log('✓ Test 5: 124 -> 129.90 (sonu_9_90)');

  // Test 6: 129.90, sonu 9,90 -> 129.90
  const t6 = calculateNewPrice(129.90, 'flat_increase', 0, 'sonu_9_90');
  assert.strictEqual(t6, 129.90, `Expected 129.90 -> 129.90 with sonu_9_90, got ${t6}`);
  console.log('✓ Test 6: 129.90 -> 129.90 (sonu_9_90)');

  // Test 7: 129.95, sonu 9,90 -> 139.90
  const t7 = calculateNewPrice(129.95, 'flat_increase', 0, 'sonu_9_90');
  assert.strictEqual(t7, 139.90, `Expected 129.95 -> 139.90 with sonu_9_90, got ${t7}`);
  console.log('✓ Test 7: 129.95 -> 139.90 (sonu_9_90)');

  // Test 8: 100 TL alış, %20 marj ve 9,90 yuvarlama -> 129.90
  const t8 = calculateNewPrice(100, 'margin', 20, 'sonu_9_90');
  assert.strictEqual(t8, 129.90, `Expected margin 20% on 100 with sonu_9_90 -> 129.90, got ${t8}`);
  console.log('✓ Test 8: 100 TL with 20% margin + sonu_9_90 -> 129.90');

  // Test 9: Invalid margin throws error
  assert.throws(() => {
    calculateNewPrice(100, 'margin', 100, 'none');
  }, /Margin must be/, 'Expected margin >= 100 to throw error');
  assert.throws(() => {
    calculateNewPrice(100, 'margin', -5, 'none');
  }, /Margin must be/, 'Expected margin < 0 to throw error');
  console.log('✓ Test 9: Invalid margins rejected correctly');

  // Test 10: Negative calculation result throws error
  assert.throws(() => {
    calculateNewPrice(10, 'flat_decrease', 15, 'none');
  }, /Price calculation resulted in a negative value/, 'Expected negative price result to throw error');
  console.log('✓ Test 10: Negative result rejected correctly');

  // Test 11: Exact 0 result is accepted
  const t11 = calculateNewPrice(10, 'flat_decrease', 10, 'none');
  assert.strictEqual(t11, 0, `Expected exact 0 result to be accepted, got ${t11}`);
  console.log('✓ Test 11: Exact 0 result accepted');

  // Test 12: Exchange rate validation
  assert.throws(() => {
    calculateNewPrice(10, 'currency_update', 0, 'none', 0);
  }, /Exchange rate must be/, 'Expected 0 exchange rate to throw error');
  assert.throws(() => {
    calculateNewPrice(10, 'currency_update', 0, 'none', -1);
  }, /Exchange rate must be/, 'Expected negative exchange rate to throw error');
  console.log('✓ Test 12: Invalid exchange rates rejected correctly');

  console.log('\n--- ALL TESTS PASSED SUCCESSFULLY ---');
  process.exit(0);
} catch (error) {
  console.error('❌ TEST FAILED:', error);
  process.exit(1);
}
