export interface PrintLoyaltyConfig {
  pricePerPhysicalSheetCents: number;
  thresholdPaidUnits: number;
  rewardFreeUnits: number;
  campaignCode: string;
  calculationVersion: string;
}

export interface PrintJobQuoteInput {
  physicalSheetCount: number;
  progressBefore: number;
  availableFreeUnitsBefore: number;
  requestedFreeUnits: number;
  staffComplimentaryUnits?: number;
  reprintUnits?: number;
  testPrintUnits?: number;
  cancelledUnits?: number;
  config: PrintLoyaltyConfig;
  sourcePrintJobId?: string;
}

export type RewardActivationMode = 'NEXT_PRINT_JOB';

export interface PrintJobQuoteResult {
  physical_sheet_count: number;
  actual_eligible_print_units: number;
  applied_loyalty_free_units: number;
  staff_complimentary_units: number;
  reprint_units: number;
  test_print_units: number;
  cancelled_units: number;
  paid_eligible_units: number;
  price_per_sheet_cents: number;
  total_amount_cents: number;
  progress_before: number;
  progress_total: number;
  earned_reward_blocks: number;
  earned_free_units: number;
  progress_after: number;
  available_free_units_before: number;
  available_free_units_after: number;
  reward_activation: RewardActivationMode;
  calculation_version: string;
  campaign_code: string;
  source_print_job_id?: string;
}

export const DEFAULT_PRINT_LOYALTY_CONFIG: PrintLoyaltyConfig = {
  pricePerPhysicalSheetCents: 1000,
  thresholdPaidUnits: 50,
  rewardFreeUnits: 10,
  campaignCode: 'PRINT_50_10_V1',
  calculationVersion: 'v1.0.0'
};
