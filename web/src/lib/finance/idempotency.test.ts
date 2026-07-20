import { strict as assert } from 'node:assert';
import { buildFinancePlanIdempotencyKey } from './idempotency';

function runTests() {
  console.log('Starting idempotency tests...');
  let passCount = 0;

  // Test A: Same customer, source type, and source reference produces identical key
  try {
    const key1 = buildFinancePlanIdempotencyKey('customer-1', 'store_sale', 'TEST-HURCELL-FINANS-20260715');
    const key2 = buildFinancePlanIdempotencyKey('customer-1', 'store_sale', 'TEST-HURCELL-FINANS-20260715');
    assert.equal(key1, 'finance-plan-v1:customer-1:store_sale:TEST-HURCELL-FINANS-20260715');
    assert.equal(key1, key2);
    passCount++;
    console.log('Test A (identical keys for identical inputs) passed.');
  } catch (err) {
    console.error('Test A failed:', err);
    process.exitCode = 1;
  }

  // Test B: Whitespace prefix/suffix in sourceReference produces the same key (trim validation)
  try {
    const keyWithSpaces = buildFinancePlanIdempotencyKey('  customer-1  ', ' store_sale ', ' \n TEST-HURCELL-FINANS-20260715 \t ');
    assert.equal(keyWithSpaces, 'finance-plan-v1:customer-1:store_sale:TEST-HURCELL-FINANS-20260715');
    passCount++;
    console.log('Test B (whitespace trimming) passed.');
  } catch (err) {
    console.error('Test B failed:', err);
    process.exitCode = 1;
  }

  // Test C: Different sourceReference produces different key
  try {
    const key1 = buildFinancePlanIdempotencyKey('customer-1', 'store_sale', 'TEST-HURCELL-FINANS-20260715');
    const key2 = buildFinancePlanIdempotencyKey('customer-1', 'store_sale', 'TEST-HURCELL-FINANS-20260716');
    assert.notEqual(key1, key2);
    passCount++;
    console.log('Test C (different reference produces different key) passed.');
  } catch (err) {
    console.error('Test C failed:', err);
    process.exitCode = 1;
  }

  // Test D: Throws when input contains empty values or invalid types
  try {
    assert.throws(() => {
      buildFinancePlanIdempotencyKey('', 'store_sale', 'REF-1');
    }, /Idempotency anahtarı bileşenleri boş olamaz/);

    assert.throws(() => {
      buildFinancePlanIdempotencyKey('customer-1', '   ', 'REF-1');
    }, /Idempotency anahtarı bileşenleri boş olamaz/);

    assert.throws(() => {
      buildFinancePlanIdempotencyKey('customer-1', 'store_sale', null as unknown as string);
    }, /Tüm argümanlar metin/);

    passCount++;
    console.log('Test D (input validation checks) passed.');
  } catch (err) {
    console.error('Test D failed:', err);
    process.exitCode = 1;
  }

  console.log(`Total tests run and passed: ${passCount}`);
  if (process.exitCode === 1) {
    console.error('Some idempotency tests failed!');
  } else {
    console.log('All idempotency tests passed successfully.');
  }
}

runTests();
