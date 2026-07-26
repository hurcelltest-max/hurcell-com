import { calculatePrintJobQuote } from './print-loyalty-engine';
import { DEFAULT_PRINT_LOYALTY_CONFIG } from './print-loyalty-types';

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

console.log('=== RUNNING PURE PRINT PRICING & LOYALTY ENGINE TESTS ===\n');

// 1. 25 sayfa / 20 ücretsiz hak / 50 TL
runTest('25 sayfa / 20 ücretsiz hak / 50 TL (5000 kuruş)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 25,
    progressBefore: 0,
    availableFreeUnitsBefore: 20,
    requestedFreeUnits: 20,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.physical_sheet_count === 25, 'physical_sheet_count must be 25');
  assert(result.actual_eligible_print_units === 25, 'actual_eligible_print_units must be 25');
  assert(result.applied_loyalty_free_units === 20, 'applied_loyalty_free_units must be 20');
  assert(result.paid_eligible_units === 5, 'paid_eligible_units must be 5');
  assert(result.total_amount_cents === 5000, 'total_amount_cents must be 5000 (50 TL)');
  assert(result.earned_reward_blocks === 0, 'earned_reward_blocks must be 0');
  assert(result.earned_free_units === 0, 'earned_free_units must be 0');
  assert(result.progress_after === 5, 'progress_after must be 5');
  assert(result.available_free_units_after === 0, 'available_free_units_after must be 0');
});

// 2. 25 sayfa / 10 ücretsiz hak / 150 TL
runTest('25 sayfa / 10 ücretsiz hak / 150 TL (15000 kuruş)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 25,
    progressBefore: 0,
    availableFreeUnitsBefore: 10,
    requestedFreeUnits: 10,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.applied_loyalty_free_units === 10, 'applied_loyalty_free_units must be 10');
  assert(result.paid_eligible_units === 15, 'paid_eligible_units must be 15');
  assert(result.total_amount_cents === 15000, 'total_amount_cents must be 15000 (150 TL)');
  assert(result.progress_after === 15, 'progress_after must be 15');
  assert(result.available_free_units_after === 0, 'available_free_units_after must be 0');
});

// 3. progress 45 + 25 sayfa (Yeni hak kazanımı)
runTest('progress 45 + 25 yeni sayfa (1 blok kazanılır, 10 yeni hak)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 25,
    progressBefore: 45,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.paid_eligible_units === 25, 'paid_eligible_units must be 25');
  assert(result.total_amount_cents === 25000, 'total_amount_cents must be 25000 (250 TL)');
  assert(result.progress_total === 70, 'progress_total must be 70');
  assert(result.earned_reward_blocks === 1, 'earned_reward_blocks must be 1');
  assert(result.earned_free_units === 10, 'earned_free_units must be 10');
  assert(result.progress_after === 20, 'progress_after must be 20');
  assert(result.available_free_units_after === 10, 'available_free_units_after must be 10');
  assert(result.reward_activation === 'NEXT_PRINT_JOB', 'reward_activation must be NEXT_PRINT_JOB');
});

// 4. 50 sayfa tam eşik testi
runTest('50 sayfa tam eşik testi (Tam 1 blok kazanılır)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 50,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.paid_eligible_units === 50, 'paid_eligible_units must be 50');
  assert(result.earned_reward_blocks === 1, 'earned_reward_blocks must be 1');
  assert(result.earned_free_units === 10, 'earned_free_units must be 10');
  assert(result.progress_after === 0, 'progress_after must be 0');
  assert(result.available_free_units_after === 10, 'available_free_units_after must be 10');
});

// 5. 100 sayfa çoklu blok testi
runTest('100 sayfa çoklu blok testi (2 blok kazanılır, 20 yeni hak)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 100,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.paid_eligible_units === 100, 'paid_eligible_units must be 100');
  assert(result.earned_reward_blocks === 2, 'earned_reward_blocks must be 2');
  assert(result.earned_free_units === 20, 'earned_free_units must be 20');
  assert(result.progress_after === 0, 'progress_after must be 0');
  assert(result.available_free_units_after === 20, 'available_free_units_after must be 20');
});

// 6. Çift taraflı 13 fiziksel kâğıt
runTest('Çift taraflı 13 fiziksel kâğıt (130 TL)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 13,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.actual_eligible_print_units === 13, 'actual_eligible_print_units must be 13');
  assert(result.paid_eligible_units === 13, 'paid_eligible_units must be 13');
  assert(result.total_amount_cents === 13000, 'total_amount_cents must be 13000 (130 TL)');
});

// 7. Tek taraflı 25 fiziksel kâğıt
runTest('Tek taraflı 25 fiziksel kâğıt (250 TL)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 25,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.actual_eligible_print_units === 25, 'actual_eligible_print_units must be 25');
  assert(result.paid_eligible_units === 25, 'paid_eligible_units must be 25');
  assert(result.total_amount_cents === 25000, 'total_amount_cents must be 25000 (250 TL)');
});

// 8. Ücretsiz kullanılan sayfanın ilerleme üretmemesi
runTest('Ücretsiz kullanılan sayfanın ilerleme üretmemesi', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 10,
    progressBefore: 0,
    availableFreeUnitsBefore: 10,
    requestedFreeUnits: 10,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.applied_loyalty_free_units === 10, 'applied_loyalty_free_units must be 10');
  assert(result.paid_eligible_units === 0, 'paid_eligible_units must be 0');
  assert(result.total_amount_cents === 0, 'total_amount_cents must be 0');
  assert(result.progress_total === 0, 'progress_total must be 0');
  assert(result.progress_after === 0, 'progress_after must be 0');
});

// 9. Staff complimentary ilerleme üretmemesi
runTest('Staff complimentary sayfanın ilerleme üretmemesi', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 10,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    staffComplimentaryUnits: 10,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.paid_eligible_units === 0, 'paid_eligible_units must be 0');
  assert(result.progress_after === 0, 'progress_after must be 0');
});

// 10. Reprint ilerleme üretmemesi
runTest('Reprint sayfanın ilerleme üretmemesi', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 10,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    reprintUnits: 10,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.paid_eligible_units === 0, 'paid_eligible_units must be 0');
  assert(result.progress_after === 0, 'progress_after must be 0');
});

// 11. Test print ilerleme üretmemesi
runTest('Test print sayfanın ilerleme üretmemesi', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 5,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    testPrintUnits: 5,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.paid_eligible_units === 0, 'paid_eligible_units must be 0');
  assert(result.progress_after === 0, 'progress_after must be 0');
});

// 12. Cancelled unit ilerleme üretmemesi
runTest('Cancelled unit sayfanın ilerleme üretmemesi', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 8,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 0,
    cancelledUnits: 8,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.paid_eligible_units === 0, 'paid_eligible_units must be 0');
  assert(result.progress_after === 0, 'progress_after must be 0');
});

// 13. İstisnai karma örnek (Section 11)
runTest('İstisnai karma örnek (20 physical, 5 free, 2 comp, 3 reprint, 1 test -> 9 paid)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 20,
    progressBefore: 0,
    availableFreeUnitsBefore: 5,
    requestedFreeUnits: 5,
    staffComplimentaryUnits: 2,
    reprintUnits: 3,
    testPrintUnits: 1,
    cancelledUnits: 0,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.actual_eligible_print_units === 20, 'actual_eligible_print_units must be 20');
  assert(result.applied_loyalty_free_units === 5, 'applied_loyalty_free_units must be 5');
  assert(result.paid_eligible_units === 9, 'paid_eligible_units must be 9');
  assert(result.total_amount_cents === 9000, 'total_amount_cents must be 9000 (90 TL)');
  assert(result.progress_after === 9, 'progress_after must be 9');
});

// 14. requestedFreeUnits bakiyeden büyük (bakiyeyle sınırlanmalı)
runTest('requestedFreeUnits bakiyeden büyük (bakiyeyle sınırlama)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 30,
    progressBefore: 0,
    availableFreeUnitsBefore: 5,
    requestedFreeUnits: 50,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.applied_loyalty_free_units === 5, 'applied_loyalty_free_units must be capped at 5');
  assert(result.paid_eligible_units === 25, 'paid_eligible_units must be 25');
});

// 15. requestedFreeUnits baskıdan büyük (baskı sayısıyla sınırlanmalı)
runTest('requestedFreeUnits baskıdan büyük (baskı sayısıyla sınırlama)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 10,
    progressBefore: 0,
    availableFreeUnitsBefore: 50,
    requestedFreeUnits: 50,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.applied_loyalty_free_units === 10, 'applied_loyalty_free_units must be capped at 10');
  assert(result.paid_eligible_units === 0, 'paid_eligible_units must be 0');
  assert(result.available_free_units_after === 40, 'available_free_units_after must be 40 (50 - 10)');
});

// 16. Yeni kazanılan hakkın aynı işlemde kullanılamaması
runTest('Yeni kazanılan hakkın aynı işlemde kullanılamaması (NEXT_PRINT_JOB)', () => {
  const result = calculatePrintJobQuote({
    physicalSheetCount: 50,
    progressBefore: 0,
    availableFreeUnitsBefore: 0,
    requestedFreeUnits: 10,
    config: DEFAULT_PRINT_LOYALTY_CONFIG,
  });

  assert(result.applied_loyalty_free_units === 0, 'applied_loyalty_free_units must be 0');
  assert(result.paid_eligible_units === 50, 'paid_eligible_units must be 50');
  assert(result.earned_free_units === 10, 'earned_free_units must be 10');
  assert(result.available_free_units_after === 10, 'available_free_units_after must be 10 (available for next job)');
  assert(result.reward_activation === 'NEXT_PRINT_JOB', 'reward_activation must be NEXT_PRINT_JOB');
});

// 17. Negatif değer reddi
runTest('Negatif değer reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: -5,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'Must throw error on negative physicalSheetCount');
});

// 18. NaN reddi
runTest('NaN reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: NaN,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'Must throw error on NaN input');
});

// 19. Decimal unit reddi
runTest('Decimal unit reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 12.5,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'Must throw error on non-integer unit');
});

// 20. Geçersiz config reddi
runTest('Geçersiz config reddi', () => {
  let threwPrice = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 10,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: { ...DEFAULT_PRINT_LOYALTY_CONFIG, pricePerPhysicalSheetCents: 0 },
    });
  } catch {
    threwPrice = true;
  }
  assert(threwPrice, 'Must throw error when pricePerPhysicalSheetCents <= 0');

  let threwThreshold = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 10,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: { ...DEFAULT_PRINT_LOYALTY_CONFIG, thresholdPaidUnits: 0 },
    });
  } catch {
    threwThreshold = true;
  }
  assert(threwThreshold, 'Must throw error when thresholdPaidUnits <= 0');
});

// 21. İstisna toplamının kalan uygun birimi aşması reddi
runTest('İstisna toplamının kalan uygun birimi aşması reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 10,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      staffComplimentaryUnits: 15,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'Must throw error when non-paid exceptions exceed available print units');
});

// === OVERFLOW TESTS (HARDENING) ===

// 22. paidEligibleUnits * pricePerPhysicalSheetCents taşması reddi
runTest('paidEligibleUnits * pricePerPhysicalSheetCents taşması reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 1000,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: {
        ...DEFAULT_PRINT_LOYALTY_CONFIG,
        pricePerPhysicalSheetCents: Number.MAX_SAFE_INTEGER,
      },
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe integer');
  }
  assert(threw, 'Must throw safe integer overflow error on price multiplication');
});

// 23. progressBefore + paidEligibleUnits taşması reddi
runTest('progressBefore + paidEligibleUnits taşması reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 10,
      progressBefore: Number.MAX_SAFE_INTEGER - 5,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe integer');
  }
  assert(threw, 'Must throw safe integer overflow error on progress addition');
});

// 24. earnedRewardBlocks * rewardFreeUnits taşması reddi
runTest('earnedRewardBlocks * rewardFreeUnits taşması reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 100,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: {
        ...DEFAULT_PRINT_LOYALTY_CONFIG,
        rewardFreeUnits: Number.MAX_SAFE_INTEGER,
      },
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe integer');
  }
  assert(threw, 'Must throw safe integer overflow error on earned free units multiplication');
});

// 25. İstisnai birim toplamında safe integer taşması reddi
runTest('İstisnai birim toplamında safe integer taşması reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: Number.MAX_SAFE_INTEGER,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      staffComplimentaryUnits: Number.MAX_SAFE_INTEGER,
      reprintUnits: Number.MAX_SAFE_INTEGER,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe integer');
  }
  assert(threw, 'Must throw safe integer overflow error on exception sum');
});

// 26. Number.MAX_SAFE_INTEGER'dan büyük input reddi
runTest('Number.MAX_SAFE_INTEGER’dan büyük input reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: Number.MAX_SAFE_INTEGER + 10,
      progressBefore: 0,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe non-negative integer');
  }
  assert(threw, 'Must throw error when input exceeds MAX_SAFE_INTEGER');
});

// 27. MAX_SAFE_INTEGER input olarak kabul edilse bile sonraki toplama/çarpma taşacaksa işlem reddedilir
runTest('MAX_SAFE_INTEGER input sonrası toplama taşması reddi', () => {
  let threw = false;
  try {
    calculatePrintJobQuote({
      physicalSheetCount: 1,
      progressBefore: Number.MAX_SAFE_INTEGER,
      availableFreeUnitsBefore: 0,
      requestedFreeUnits: 0,
      config: DEFAULT_PRINT_LOYALTY_CONFIG,
    });
  } catch (err: unknown) {
    threw = String(err).includes('safe integer');
  }
  assert(threw, 'Must throw safe integer overflow error when progress addition overflows');
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
  console.log('\nALL PRINT LOYALTY ENGINE TESTS PASSED SUCCESSFULLY! ✨');
}
