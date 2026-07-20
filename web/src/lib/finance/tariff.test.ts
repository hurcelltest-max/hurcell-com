import { strict as assert } from 'node:assert';
import {
  calculateFinanceAmounts,
  getFinanceTermRatePercent,
  FINANCE_TARIFF_VERSION,
  FINANCE_MONTHLY_RATE_PERCENT
} from './tariff';

function runTests() {
  console.log(`Starting tariff tests for version: ${FINANCE_TARIFF_VERSION}`);
  let passCount = 0;

  // Test A: 750 / 150 / 3
  try {
    const res = calculateFinanceAmounts(750, 150, 3);
    assert.equal(res.financedPrincipal, 600.00);
    assert.equal(res.monthlyRatePercent, 3.25);
    assert.equal(res.termRatePercent, 10.0703);
    assert.equal(res.chargeAmount, 60.42);
    assert.equal(res.totalDueAmount, 660.42);
    assert.equal(res.installments.length, 3);
    assert.equal(res.installments[0].amount, 220.14);
    assert.equal(res.installments[1].amount, 220.14);
    assert.equal(res.installments[2].amount, 220.14);
    passCount++;
    console.log('Test A (750 / 150 / 3) passed.');
  } catch (err) {
    console.error('Test A failed:', err);
    process.exitCode = 1;
  }

  // Test B: 750 / 150 / 2
  try {
    const res = calculateFinanceAmounts(750, 150, 2);
    assert.equal(res.financedPrincipal, 600.00);
    assert.equal(res.monthlyRatePercent, 3.25);
    assert.equal(res.termRatePercent, 6.6056);
    assert.equal(res.chargeAmount, 39.63);
    assert.equal(res.totalDueAmount, 639.63);
    assert.equal(res.installments.length, 2);
    assert.equal(res.installments[0].amount, 319.81);
    assert.equal(res.installments[1].amount, 319.82);
    passCount++;
    console.log('Test B (750 / 150 / 2) passed.');
  } catch (err) {
    console.error('Test B failed:', err);
    process.exitCode = 1;
  }

  // Test C: 750 / 150 / 1
  try {
    const res = calculateFinanceAmounts(750, 150, 1);
    assert.equal(res.financedPrincipal, 600.00);
    assert.equal(res.monthlyRatePercent, 3.25);
    assert.equal(res.termRatePercent, 0);
    assert.equal(res.chargeAmount, 0);
    assert.equal(res.totalDueAmount, 600.00);
    assert.equal(res.installments.length, 1);
    assert.equal(res.installments[0].amount, 600.00);
    passCount++;
    console.log('Test C (750 / 150 / 1) passed.');
  } catch (err) {
    console.error('Test C failed:', err);
    process.exitCode = 1;
  }

  // Test D: downPayment > cashPrice
  try {
    assert.throws(() => {
      calculateFinanceAmounts(750, 800, 3);
    }, /Peşinat satış bedelinden büyük olamaz/);
    passCount++;
    console.log('Test D (downPayment > cashPrice throws) passed.');
  } catch (err) {
    console.error('Test D failed:', err);
    process.exitCode = 1;
  }

  // Test E: installmentCount = 4
  try {
    assert.throws(() => {
      calculateFinanceAmounts(750, 150, 4);
    }, /Taksit sayısı yalnız 1, 2 veya 3 olabilir/);
    passCount++;
    console.log('Test E (installmentCount = 4 throws) passed.');
  } catch (err) {
    console.error('Test E failed:', err);
    process.exitCode = 1;
  }

  // Test F: NaN / Infinity / Non-finite values
  try {
    assert.throws(() => {
      calculateFinanceAmounts(NaN, 150, 3);
    }, /Değerler sonlu sayılar olmalıdır/);
    assert.throws(() => {
      calculateFinanceAmounts(750, Infinity, 3);
    }, /Değerler sonlu sayılar olmalıdır/);
    passCount++;
    console.log('Test F (NaN / Infinity throws) passed.');
  } catch (err) {
    console.error('Test F failed:', err);
    process.exitCode = 1;
  }

  // Test G: Cents rounding division goes to last installment
  try {
    const res = calculateFinanceAmounts(750.01, 150.00, 3);
    assert.equal(res.totalDueAmount, 660.43);
    assert.equal(res.installments[0].amount, 220.14);
    assert.equal(res.installments[1].amount, 220.14);
    assert.equal(res.installments[2].amount, 220.15);
    passCount++;
    console.log('Test G (cents fractional division goes to last installment) passed.');
  } catch (err) {
    console.error('Test G failed:', err);
    process.exitCode = 1;
  }

  // Test H: getFinanceTermRatePercent invalid count
  try {
    assert.throws(() => {
      getFinanceTermRatePercent(0);
    });
    assert.throws(() => {
      getFinanceTermRatePercent(4);
    });
    passCount++;
    console.log('Test H (getFinanceTermRatePercent validation) passed.');
  } catch (err) {
    console.error('Test H failed:', err);
    process.exitCode = 1;
  }

  // Test I: Verify monthly rate percent and term rates explicitly
  try {
    assert.equal(FINANCE_MONTHLY_RATE_PERCENT, 3.25);
    assert.equal(getFinanceTermRatePercent(1), 0);
    assert.equal(getFinanceTermRatePercent(2), 6.6056);
    assert.equal(getFinanceTermRatePercent(3), 10.0703);
    passCount++;
    console.log('Test I (monthly reference rate and term rates validation) passed.');
  } catch (err) {
    console.error('Test I failed:', err);
    process.exitCode = 1;
  }

  console.log(`Total tests run and passed: ${passCount}`);
  if (process.exitCode === 1) {
    console.error('Some tests failed!');
  } else {
    console.log('All tests passed successfully.');
  }
}

runTests();
