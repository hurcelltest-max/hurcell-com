import assert from 'node:assert';
import { 
  calculateNewPrice, 
  validateExchangeRate, 
  validateForeignBuyPrice, 
  calculateKeepRatioPrice 
} from '../src/lib/priceMath';

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

  // Test 13: Satış fiyatına %15 zam: 100 => 115
  const t13 = calculateNewPrice(100, 'percent_increase', 15, 'none');
  assert.strictEqual(t13, 115, `Expected percent_increase 15% on 100 -> 115, got ${t13}`);
  console.log('✓ Test 13: Satış fiyatına %15 zam: 100 => 115');

  // Test 14: Satış fiyatına %15 zam + sonu 9,90: 100 => 119.90
  const t14 = calculateNewPrice(100, 'percent_increase', 15, 'sonu_9_90');
  assert.strictEqual(t14, 119.90, `Expected percent_increase 15% on 100 with sonu_9_90 -> 119.90, got ${t14}`);
  console.log('✓ Test 14: Satış fiyatına %15 zam + sonu 9,90: 100 => 119.90');

  // Test 15: USD foreign_buy_price 10, kur 33.50 => buy_price 335.00
  const t15 = calculateNewPrice(10, 'currency_update', 0, 'none', 33.50);
  assert.strictEqual(t15, 335.00, `Expected currency_update with rate 33.50 on 10 -> 335.00, got ${t15}`);
  console.log('✓ Test 15: USD foreign_buy_price 10, kur 33.50 => buy_price 335.00');

  // Test 16: USD 10, kur 33.50, %20 markup => sell_price 402.00
  const t16_buy = calculateNewPrice(10, 'currency_update', 0, 'none', 33.50);
  const t16_sell = calculateNewPrice(t16_buy, 'markup', 20, 'none');
  assert.strictEqual(t16_sell, 402.00, `Expected markup 20% on 335 -> 402.00, got ${t16_sell}`);
  console.log('✓ Test 16: USD 10, kur 33.50, %20 markup => sell_price 402.00');

  // Test 17: USD 10, kur 33.50, %20 margin => sell_price 418.75
  const t17_buy = calculateNewPrice(10, 'currency_update', 0, 'none', 33.50);
  const t17_sell = calculateNewPrice(t17_buy, 'margin', 20, 'none');
  assert.strictEqual(t17_sell, 418.75, `Expected margin 20% on 335 -> 418.75, got ${t17_sell}`);
  console.log('✓ Test 17: USD 10, kur 33.50, %20 margin => sell_price 418.75');

  // Test 18: Keep ratio calculation
  const t18 = calculateKeepRatioPrice(100, 150, 200, 'none');
  assert.strictEqual(t18, 300, `Expected ratio of 1.5 on 200 -> 300, got ${t18}`);
  const t18_rounded = calculateKeepRatioPrice(100, 150, 200, 'sonu_9_90');
  assert.strictEqual(t18_rounded, 309.90, `Expected ratio of 1.5 on 200 with sonu_9_90 -> 309.90, got ${t18_rounded}`);
  console.log('✓ Test 18: Keep ratio price calculations');

  // Test 19: Validators checks
  assert.throws(() => validateExchangeRate(0), /Exchange rate must be/, 'Expected 0 rate to throw');
  assert.throws(() => validateExchangeRate(-5), /Exchange rate must be/, 'Expected negative rate to throw');
  assert.throws(() => validateExchangeRate(''), /Exchange rate is required/, 'Expected empty rate to throw');
  const rateResult = validateExchangeRate('33.50');
  assert.strictEqual(rateResult, 33.50, `Expected 33.50, got ${rateResult}`);

  assert.throws(() => validateForeignBuyPrice(null), /Foreign buy price is missing/, 'Expected missing foreign price to throw');
  assert.throws(() => validateForeignBuyPrice(-10), /Foreign buy price must be positive/, 'Expected negative foreign price to throw');
  const foreignResult = validateForeignBuyPrice(12.50);
  assert.strictEqual(foreignResult, 12.50, `Expected 12.50, got ${foreignResult}`);
  console.log('✓ Test 19: Input validator helpers correctly throw and resolve');

  console.log('\n--- ALL TESTS PASSED SUCCESSFULLY ---');
  process.exit(0);
} catch (error) {
  console.error('❌ TEST FAILED:', error);
  process.exit(1);
}
