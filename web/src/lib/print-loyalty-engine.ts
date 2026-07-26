import {
  PrintJobQuoteInput,
  PrintJobQuoteResult,
  PrintLoyaltyConfig,
} from './print-loyalty-types';

function assertSafeNonNegativeInteger(value: unknown, name: string): number {
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

function assertSafePositiveInteger(value: unknown, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Number.isNaN(value) ||
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`Invalid ${name}: must be a safe positive integer`);
  }
  return value;
}

function safeAddIntegers(a: number, b: number, name: string): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new Error(`Overflow in ${name}: sum exceeds safe integer limit`);
  }
  return sum;
}

function safeMultiplyIntegers(a: number, b: number, name: string): number {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new Error(`Overflow in ${name}: product exceeds safe integer limit`);
  }
  return product;
}

function validateConfig(config: unknown): PrintLoyaltyConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid config: config object is required');
  }

  const c = config as Record<string, unknown>;

  assertSafePositiveInteger(
    c.pricePerPhysicalSheetCents,
    'config.pricePerPhysicalSheetCents'
  );
  assertSafePositiveInteger(
    c.thresholdPaidUnits,
    'config.thresholdPaidUnits'
  );
  assertSafePositiveInteger(c.rewardFreeUnits, 'config.rewardFreeUnits');

  if (typeof c.campaignCode !== 'string' || c.campaignCode.trim() === '') {
    throw new Error('Invalid config.campaignCode: must be a non-empty string');
  }

  if (
    typeof c.calculationVersion !== 'string' ||
    c.calculationVersion.trim() === ''
  ) {
    throw new Error(
      'Invalid config.calculationVersion: must be a non-empty string'
    );
  }

  return {
    pricePerPhysicalSheetCents: c.pricePerPhysicalSheetCents as number,
    thresholdPaidUnits: c.thresholdPaidUnits as number,
    rewardFreeUnits: c.rewardFreeUnits as number,
    campaignCode: (c.campaignCode as string).trim(),
    calculationVersion: (c.calculationVersion as string).trim(),
  };
}

export function calculatePrintJobQuote(
  input: PrintJobQuoteInput
): PrintJobQuoteResult {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: input object is required');
  }

  const validatedConfig = validateConfig(input.config);

  const physicalSheetCount = assertSafeNonNegativeInteger(
    input.physicalSheetCount,
    'physicalSheetCount'
  );
  const progressBefore = assertSafeNonNegativeInteger(
    input.progressBefore,
    'progressBefore'
  );
  const availableFreeUnitsBefore = assertSafeNonNegativeInteger(
    input.availableFreeUnitsBefore,
    'availableFreeUnitsBefore'
  );
  const requestedFreeUnits = assertSafeNonNegativeInteger(
    input.requestedFreeUnits,
    'requestedFreeUnits'
  );

  const staffComplimentaryUnits = assertSafeNonNegativeInteger(
    input.staffComplimentaryUnits ?? 0,
    'staffComplimentaryUnits'
  );
  const reprintUnits = assertSafeNonNegativeInteger(
    input.reprintUnits ?? 0,
    'reprintUnits'
  );
  const testPrintUnits = assertSafeNonNegativeInteger(
    input.testPrintUnits ?? 0,
    'testPrintUnits'
  );
  const cancelledUnits = assertSafeNonNegativeInteger(
    input.cancelledUnits ?? 0,
    'cancelledUnits'
  );

  // 1 physical sheet = 1 eligible print unit
  const actualEligiblePrintUnits = physicalSheetCount;

  // Free units applied (cannot exceed requested, available before, or actual eligible units)
  const appliedLoyaltyFreeUnits = Math.min(
    requestedFreeUnits,
    availableFreeUnitsBefore,
    actualEligiblePrintUnits
  );

  const remainingAfterLoyalty =
    actualEligiblePrintUnits - appliedLoyaltyFreeUnits;

  // Safe addition of non-paid exception units
  const exc1 = safeAddIntegers(staffComplimentaryUnits, reprintUnits, 'exception sum (comp + reprint)');
  const exc2 = safeAddIntegers(exc1, testPrintUnits, 'exception sum (comp + reprint + test)');
  const nonPaidExceptionUnits = safeAddIntegers(exc2, cancelledUnits, 'nonPaidExceptionUnits');

  if (nonPaidExceptionUnits > remainingAfterLoyalty) {
    throw new Error(
      'Non-paid exception units cannot exceed remaining units after loyalty free units application'
    );
  }

  const paidEligibleUnits = remainingAfterLoyalty - nonPaidExceptionUnits;

  const pricePerSheetCents = validatedConfig.pricePerPhysicalSheetCents;
  const totalAmountCents = safeMultiplyIntegers(
    paidEligibleUnits,
    pricePerSheetCents,
    'totalAmountCents'
  );

  const progressTotal = safeAddIntegers(
    progressBefore,
    paidEligibleUnits,
    'progressTotal'
  );

  const earnedRewardBlocks = Math.floor(
    progressTotal / validatedConfig.thresholdPaidUnits
  );

  const earnedFreeUnits = safeMultiplyIntegers(
    earnedRewardBlocks,
    validatedConfig.rewardFreeUnits,
    'earnedFreeUnits'
  );

  const progressAfter = progressTotal % validatedConfig.thresholdPaidUnits;

  // Next-job rule: earned_free_units added to available units for subsequent jobs
  const remainingFreeUnitsBefore = availableFreeUnitsBefore - appliedLoyaltyFreeUnits;
  const availableFreeUnitsAfter = safeAddIntegers(
    remainingFreeUnitsBefore,
    earnedFreeUnits,
    'availableFreeUnitsAfter'
  );

  return {
    physical_sheet_count: physicalSheetCount,
    actual_eligible_print_units: actualEligiblePrintUnits,
    applied_loyalty_free_units: appliedLoyaltyFreeUnits,
    staff_complimentary_units: staffComplimentaryUnits,
    reprint_units: reprintUnits,
    test_print_units: testPrintUnits,
    cancelled_units: cancelledUnits,
    paid_eligible_units: paidEligibleUnits,
    price_per_sheet_cents: pricePerSheetCents,
    total_amount_cents: totalAmountCents,
    progress_before: progressBefore,
    progress_total: progressTotal,
    earned_reward_blocks: earnedRewardBlocks,
    earned_free_units: earnedFreeUnits,
    progress_after: progressAfter,
    available_free_units_before: availableFreeUnitsBefore,
    available_free_units_after: availableFreeUnitsAfter,
    reward_activation: 'NEXT_PRINT_JOB',
    calculation_version: validatedConfig.calculationVersion,
    campaign_code: validatedConfig.campaignCode,
    source_print_job_id: input.sourcePrintJobId,
  };
}
