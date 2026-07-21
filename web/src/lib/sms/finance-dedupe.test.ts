import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildFinanceSmsDedupeKey } from './finance-dedupe';

// Test A: Aynı plan created girdileri aynı key üretir.
const keyA1 = buildFinanceSmsDedupeKey('plan-123', 'finance_plan_created', 'plan');
const keyA2 = buildFinanceSmsDedupeKey('plan-123', 'finance_plan_created', 'plan');
assert.strictEqual(keyA1, keyA2);
assert.strictEqual(keyA1, 'finance:plan-123:finance_plan_created:plan');

// Test B: Baş/son boşluklar aynı key sonucunu üretir.
const keyB1 = buildFinanceSmsDedupeKey(' plan-123 ', 'finance_plan_created', ' plan ');
assert.strictEqual(keyB1, 'finance:plan-123:finance_plan_created:plan');

// Test C: Farklı collectionId farklı key üretir.
const keyC1 = buildFinanceSmsDedupeKey('plan-123', 'finance_payment_received', 'collection:col-abc');
const keyC2 = buildFinanceSmsDedupeKey('plan-123', 'finance_payment_received', 'collection:col-xyz');
assert.notStrictEqual(keyC1, keyC2);

// Test D: payment_received ve balance_remaining aynı collectionId kullansa bile event farklı olduğu için key farklıdır.
const keyD1 = buildFinanceSmsDedupeKey('plan-123', 'finance_payment_received', 'collection:col-abc');
const keyD2 = buildFinanceSmsDedupeKey('plan-123', 'finance_balance_remaining', 'collection:col-abc');
assert.notStrictEqual(keyD1, keyD2);

// Test E: Aynı installmentId ve aynı asOfDate aynı overdue key üretir.
const keyE1 = buildFinanceSmsDedupeKey('plan-123', 'finance_installment_overdue', 'installment:inst-999:as-of:2026-07-21');
const keyE2 = buildFinanceSmsDedupeKey('plan-123', 'finance_installment_overdue', 'installment:inst-999:as-of:2026-07-21');
assert.strictEqual(keyE1, keyE2);

// Test F: Aynı installmentId fakat farklı asOfDate farklı overdue key üretir.
const keyF1 = buildFinanceSmsDedupeKey('plan-123', 'finance_installment_overdue', 'installment:inst-999:as-of:2026-07-21');
const keyF2 = buildFinanceSmsDedupeKey('plan-123', 'finance_installment_overdue', 'installment:inst-999:as-of:2026-07-22');
assert.notStrictEqual(keyF1, keyF2);

// Test G: Aynı installmentId ve dueDate aynı due-soon key üretir.
const keyG1 = buildFinanceSmsDedupeKey('plan-123', 'finance_installment_due_soon', 'installment:inst-999:due:2026-07-25');
const keyG2 = buildFinanceSmsDedupeKey('plan-123', 'finance_installment_due_soon', 'installment:inst-999:due:2026-07-25');
assert.strictEqual(keyG1, keyG2);

// Test H: Boş planId hata.
assert.throws(() => {
  buildFinanceSmsDedupeKey('', 'finance_plan_created', 'plan');
}, /planId cannot be empty/);

assert.throws(() => {
  buildFinanceSmsDedupeKey('   ', 'finance_plan_created', 'plan');
}, /planId cannot be empty/);

// Test I: Boş eventInstanceKey hata.
assert.throws(() => {
  buildFinanceSmsDedupeKey('plan-123', 'finance_plan_created', '');
}, /eventInstanceKey cannot be empty/);

assert.throws(() => {
  buildFinanceSmsDedupeKey('plan-123', 'finance_plan_created', '   ');
}, /eventInstanceKey cannot be empty/);

// Test J: 255 karakterden uzun key hata.
const veryLongPlanId = 'a'.repeat(200);
const veryLongInstanceKey = 'b'.repeat(100);
assert.throws(() => {
  buildFinanceSmsDedupeKey(veryLongPlanId, 'finance_plan_created', veryLongInstanceKey);
}, /Idempotency key exceeds 255 characters limit/);

// Test K: Helper kaynak kodunda Date.now, Math.random ve randomUUID bulunmaz.
let source = '';
const pathsToTry = [
  path.join(process.cwd(), 'src/lib/sms/finance-dedupe.ts'),
  path.join(process.cwd(), 'web/src/lib/sms/finance-dedupe.ts'),
  path.join(__dirname, '../../src/lib/sms/finance-dedupe.ts'),
  path.join(__dirname, '../../../src/lib/sms/finance-dedupe.ts'),
  path.join(__dirname, 'finance-dedupe.ts')
];
for (const p of pathsToTry) {
  if (fs.existsSync(p)) {
    source = fs.readFileSync(p, 'utf8');
    break;
  }
}
if (!source) {
  throw new Error('Could not find finance-dedupe.ts to analyze');
}

assert.ok(!source.includes('Date.now'), 'Should not contain Date.now');
assert.ok(!source.includes('Math.random'), 'Should not contain Math.random');
assert.ok(!source.includes('randomUUID'), 'Should not contain randomUUID');

// Test L: Static checks for sendFinanceSms function in transactional.ts
let transactionalSource = '';
const transactionalPaths = [
  path.join(process.cwd(), 'src/lib/sms/transactional.ts'),
  path.join(process.cwd(), 'web/src/lib/sms/transactional.ts'),
  path.join(__dirname, '../../src/lib/sms/transactional.ts'),
  path.join(__dirname, '../../../src/lib/sms/transactional.ts'),
  path.join(__dirname, 'transactional.ts')
];
for (const p of transactionalPaths) {
  if (fs.existsSync(p)) {
    transactionalSource = fs.readFileSync(p, 'utf8');
    break;
  }
}
if (!transactionalSource) {
  throw new Error('Could not find transactional.ts to analyze');
}

const financeFunctionStart =
  transactionalSource.indexOf(
    'export async function sendFinanceSms'
  );

const financeFunctionEnd =
  transactionalSource.indexOf(
    'function generateFinanceMessage',
    financeFunctionStart
  );

assert.ok(
  financeFunctionStart >= 0,
  'sendFinanceSms function should exist'
);

assert.ok(
  financeFunctionEnd > financeFunctionStart,
  'sendFinanceSms function boundary should exist'
);

const financeSmsSource =
  transactionalSource.slice(
    financeFunctionStart,
    financeFunctionEnd
  );

assert.ok(
  !financeSmsSource.includes('| Message:'),
  'Finance SMS console log should not include the message body'
);

const retryClaimStart =
  financeSmsSource.indexOf(
    'const { data: updated, error: updateErr }'
  );

const retryClaimEnd =
  financeSmsSource.indexOf(
    'if (updateErr || !updated)',
    retryClaimStart
  );

assert.ok(
  retryClaimStart >= 0,
  'Finance retry claim should exist'
);

assert.ok(
  retryClaimEnd > retryClaimStart,
  'Finance retry claim boundary should exist'
);

const retryClaimSource =
  financeSmsSource.slice(
    retryClaimStart,
    retryClaimEnd
  );

assert.ok(
  retryClaimSource.includes(
    ".eq('status', existing.status)"
  ),
  'Finance retry should use status concurrency token'
);

assert.ok(
  retryClaimSource.includes(
    ".eq('attempt_count', observedAttemptCount)"
  ),
  'Finance retry should use attempt_count concurrency token'
);

assert.ok(
  !retryClaimSource.includes(
    ".in('status', ['pending', 'failed'])"
  ),
  'Finance retry claim should not use the old status list'
);

assert.ok(
  retryClaimSource.includes('.maybeSingle()'),
  'Finance retry claim should allow a zero-row race loss'
);

assert.ok(
  !retryClaimSource.includes('.single()'),
  'Finance retry claim should not require exactly one returned row'
);

// Test M: Static checks for notifications route
let routeSource = '';
const routePaths = [
  path.join(process.cwd(), 'src/app/api/admin/finance/notifications/run/route.ts'),
  path.join(process.cwd(), 'web/src/app/api/admin/finance/notifications/run/route.ts'),
  path.join(__dirname, '../../../../../app/api/admin/finance/notifications/run/route.ts'),
  path.join(__dirname, '../../../../../../app/api/admin/finance/notifications/run/route.ts')
];
for (const p of routePaths) {
  if (fs.existsSync(p)) {
    routeSource = fs.readFileSync(p, 'utf8');
    break;
  }
}
if (!routeSource) {
  throw new Error('Could not find notifications/run/route.ts to analyze');
}

assert.ok(routeSource.includes("typeof inst.id === 'string'"), 'notifications route should contain installmentId string validation');
assert.ok(routeSource.includes(".trim()"), 'notifications route should contain trim() on installmentId');
assert.ok(routeSource.includes('[FINANCE NOTIFICATION WARNING]'), 'notifications route should contain warning for missing installmentId');
assert.ok(routeSource.includes("`installment:${installmentId}:"), 'Key creation should use installmentId instead of inst.id');
assert.ok(
  !routeSource.includes('installment:${inst.id}:'),
  'Dedupe key should not use unvalidated inst.id'
);

console.log('All finance-dedupe tests passed successfully!');
