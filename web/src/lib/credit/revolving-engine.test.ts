import assert from 'node:assert';
import { RevolvingCreditLedger, RevolvingAccount, toCents, toTl } from './revolving-engine';

console.log('----------------------------------------------------');
console.log('RUNNING 24 EXTENDED REVOLVING CREDIT ASSERTION TESTS');
console.log('----------------------------------------------------');

const initialAccount: RevolvingAccount = {
  id: 'acc_001',
  customer_id: 'cust_001',
  credit_limit: 1000,
  account_status: 'ACTIVE',
  is_blocked: false,
  currency: 'TRY',
  created_at: new Date().toISOString(),
};

const ledger = new RevolvingCreditLedger(initialAccount);

// Test 1: Initial Limit 1000, Sale 1000 -> Outstanding 1000, Available 0
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 1000,
    reference_type: 'ORDER',
    reference_id: 'ord_1001',
    idempotency_key: 'idem_sale_1',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, 1000);
  assert.strictEqual(res.snapshot?.available_limit, 0);
  console.log('✔ Test 1 Passed: Sale 1000 -> Outstanding 1000, Available 0');
}

// Test 2: Confirmed Payment 400 -> Outstanding 600, Available 400
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 400,
    status: 'CONFIRMED',
    reference_type: 'COLLECTION',
    reference_id: 'col_2001',
    idempotency_key: 'idem_pay_1',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, 600);
  assert.strictEqual(res.snapshot?.available_limit, 400);
  console.log('✔ Test 2 Passed: Payment 400 -> Outstanding 600, Available 400');
}

// Test 3: Sale 200 -> Outstanding 800, Available 200
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 200,
    reference_type: 'ORDER',
    reference_id: 'ord_1002',
    idempotency_key: 'idem_sale_2',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, 800);
  assert.strictEqual(res.snapshot?.available_limit, 200);
  console.log('✔ Test 3 Passed: Sale 200 -> Outstanding 800, Available 200');
}

// Test 4: Refund 100 on ord_1001 -> Outstanding 700, Available 300
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REFUND',
    amount: 100,
    reference_type: 'ORDER',
    reference_id: 'ord_1001',
    idempotency_key: 'idem_ref_1',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, 700);
  assert.strictEqual(res.snapshot?.available_limit, 300);
  console.log('✔ Test 4 Passed: Refund 100 -> Outstanding 700, Available 300');
}

// Test 5: Sale > Available Limit -> REJECT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 500, // Available limit is 300
    reference_type: 'ORDER',
    reference_id: 'ord_1003',
    idempotency_key: 'idem_sale_exceed',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, 'Kullanılabilir limit yetersizdir.');
  assert.strictEqual(res.snapshot?.available_limit, 300);
  console.log('✔ Test 5 Passed: Sale Exceeding Available Limit Rejected');
}

// Test 6: Duplicate Payment Idempotency Key -> Replay Cached Result
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 400,
    status: 'CONFIRMED',
    reference_type: 'COLLECTION',
    reference_id: 'col_2001',
    idempotency_key: 'idem_pay_1', // Replaying same key
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.is_replay, true);
  assert.strictEqual(ledger.computeSnapshot().outstanding_principal, 700);
  console.log('✔ Test 6 Passed: Duplicate Payment Idempotency Replay');
}

// Test 7: Same Key Different Payload -> CONFLICT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 999, // Different payload with same key
    status: 'CONFIRMED',
    reference_type: 'COLLECTION',
    reference_id: 'col_2001',
    idempotency_key: 'idem_pay_1',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.conflict, true);
  console.log('✔ Test 7 Passed: Same Key Different Payload Conflict Guard');
}

// Test 8: Payment > Outstanding Debt -> REJECT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 1500, // Outstanding is 700
    status: 'CONFIRMED',
    reference_type: 'COLLECTION',
    reference_id: 'col_exceed',
    idempotency_key: 'idem_pay_exceed',
  });

  assert.strictEqual(res.success, false);
  assert.ok(res.error?.includes('OVERPAYMENT_REJECTED'));
  console.log('✔ Test 8 Passed: Payment Exceeding Debt Rejected');
}

// Test 9: Blocked Account -> Sale Reject
{
  ledger.setBlocked(true, 'Yönetsel Risk Blokesi');
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 50,
    reference_type: 'ORDER',
    reference_id: 'ord_blocked',
    idempotency_key: 'idem_blocked',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, 'Hesap blokedir. Yeni kredili satış yapılamaz.');
  console.log('✔ Test 9 Passed: Blocked Account Sale Rejection');
}

// Test 10: Pending Payment -> Available Limit Unchanged
{
  const beforeSnapshot = ledger.computeSnapshot();
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 100,
    status: 'PENDING',
    reference_type: 'COLLECTION',
    reference_id: 'col_pending',
    idempotency_key: 'idem_pay_pending',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.available_limit, beforeSnapshot.available_limit);
  console.log('✔ Test 10 Passed: Pending Payment Does Not Replenish Limit');
}

// Test 11: Confirmed Payment -> Available Limit Replenished
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 200,
    status: 'CONFIRMED',
    reference_type: 'COLLECTION',
    reference_id: 'col_confirmed',
    idempotency_key: 'idem_pay_confirmed',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, 500); // 700 - 200
  assert.strictEqual(res.snapshot?.available_limit, 500); // 300 + 200
  ledger.setBlocked(false); // Unblock for remaining tests
  console.log('✔ Test 11 Passed: Confirmed Payment Replenishes Limit');
}

// Test 12: Reversal -> Correctly Reverses Original Transaction Effect
{
  const saleRes = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 100,
    reference_type: 'ORDER',
    reference_id: 'ord_to_reverse',
    idempotency_key: 'idem_sale_to_rev',
  });
  const saleTxId = saleRes.transaction!.id;
  assert.strictEqual(saleRes.snapshot?.outstanding_principal, 600);

  const revRes = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REVERSAL',
    amount: 100,
    reversal_of_transaction_id: saleTxId,
    reference_type: 'ORDER_CANCEL',
    reference_id: 'ord_cancel_1',
    idempotency_key: 'idem_reversal_1',
  });

  assert.strictEqual(revRes.success, true);
  assert.strictEqual(revRes.snapshot?.outstanding_principal, 500); // Back to 500
  assert.strictEqual(revRes.snapshot?.available_limit, 500);
  console.log('✔ Test 12 Passed: Reversal Correctly Reverses Transaction Effect');
}

// Test 13: Confirmed Payment Greater Than Debt -> REJECT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 600, // Outstanding debt is 500
    status: 'CONFIRMED',
    reference_type: 'COLLECTION',
    reference_id: 'col_excess',
    idempotency_key: 'idem_pay_excess',
  });

  assert.strictEqual(res.success, false);
  assert.ok(res.error?.includes('OVERPAYMENT_REJECTED'));
  console.log('✔ Test 13 Passed: Confirmed Payment Greater Than Debt Rejected');
}

// Test 14: Blocked Account Confirmed Payment -> ACCEPT
{
  ledger.setBlocked(true, 'Test Blokesi');
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'PAYMENT',
    amount: 100,
    status: 'CONFIRMED',
    reference_type: 'COLLECTION',
    reference_id: 'col_blocked_pay',
    idempotency_key: 'idem_blocked_pay',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, 400); // 500 - 100
  console.log('✔ Test 14 Passed: Blocked Account Confirmed Payment Accepted');
}

// Test 15: Blocked Account Refund -> ACCEPT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REFUND',
    amount: 50,
    reference_type: 'ORDER',
    reference_id: 'ord_1002',
    idempotency_key: 'idem_blocked_refund',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, 350); // 400 - 50
  ledger.setBlocked(false);
  console.log('✔ Test 15 Passed: Blocked Account Refund Accepted');
}

// Test 16: Refund Without Original Sale -> REJECT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REFUND',
    amount: 50,
    reference_type: 'ORDER',
    reference_id: 'ord_non_existent',
    idempotency_key: 'idem_no_orig_sale',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, 'İade edilecek orijinal kredili satış kaydı bulunamadı.');
  console.log('✔ Test 16 Passed: Refund Without Original Sale Rejected');
}

// Test 17: Refund Greater Than Remaining Refundable Amount -> REJECT
{
  // ord_1002 had amount 200. Refunded 50 in Test 15. Remaining refundable = 150.
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REFUND',
    amount: 200, // Exceeds remaining 150
    reference_type: 'ORDER',
    reference_id: 'ord_1002',
    idempotency_key: 'idem_exceed_refundable',
  });

  assert.strictEqual(res.success, false);
  assert.ok(res.error?.includes('aşamaz'));
  console.log('✔ Test 17 Passed: Refund Greater Than Refundable Remainder Rejected');
}

// Test 18: Duplicate Refund Idempotency Replay
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REFUND',
    amount: 50,
    reference_type: 'ORDER',
    reference_id: 'ord_1002',
    idempotency_key: 'idem_blocked_refund', // Replaying same key
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.is_replay, true);
  assert.strictEqual(ledger.computeSnapshot().outstanding_principal, 350);
  console.log('✔ Test 18 Passed: Duplicate Refund Idempotency Replay');
}

// Test 19: Same Original Transaction Reversed Twice -> REJECT
{
  // First make a sale of 50
  const saleRes = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 50,
    reference_type: 'ORDER',
    reference_id: 'ord_to_rev_twice',
    idempotency_key: 'idem_sale_rev_twice',
  });
  const saleTxId = saleRes.transaction!.id;

  // First reversal -> ACCEPT
  const rev1 = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REVERSAL',
    amount: 50,
    reversal_of_transaction_id: saleTxId,
    reference_type: 'ORDER_CANCEL',
    reference_id: 'ord_cancel_twice_1',
    idempotency_key: 'idem_rev_twice_1',
  });
  assert.strictEqual(rev1.success, true);

  // Second reversal -> REJECT
  const rev2 = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'REVERSAL',
    amount: 50,
    reversal_of_transaction_id: saleTxId,
    reference_type: 'ORDER_CANCEL',
    reference_id: 'ord_cancel_twice_2',
    idempotency_key: 'idem_rev_twice_2',
  });

  assert.strictEqual(rev2.success, false);
  assert.strictEqual(rev2.error, 'Aynı hareket ikinci kez terslenemez (DOUBLE_REVERSAL_REJECTED).');
  console.log('✔ Test 19 Passed: Double Reversal Rejected');
}

// Test 20: Pending Sale Authorization Reduces Available But Not Outstanding
{
  const snapBefore = ledger.computeSnapshot();
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 100,
    status: 'PENDING',
    reference_type: 'ORDER',
    reference_id: 'ord_pending_sale',
    idempotency_key: 'idem_pending_sale',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, snapBefore.outstanding_principal); // Unchanged!
  assert.strictEqual(res.snapshot?.pending_authorizations, 100);
  assert.strictEqual(res.snapshot?.available_limit, snapBefore.available_limit - 100); // Available reduced!
  console.log('✔ Test 20 Passed: Pending Sale Authorization Reduces Available But Not Outstanding');
}

// Test 21: Failed/Cancelled Transaction Has No Financial Effect
{
  const snapBefore = ledger.computeSnapshot();
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 100,
    status: 'FAILED',
    reference_type: 'ORDER',
    reference_id: 'ord_failed',
    idempotency_key: 'idem_failed_sale',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.snapshot?.outstanding_principal, snapBefore.outstanding_principal);
  assert.strictEqual(res.snapshot?.available_limit, snapBefore.available_limit);
  console.log('✔ Test 21 Passed: Failed Transaction Has Zero Financial Effect');
}

// Test 22: Exact Kuruş Precision Test (0.10 + 0.20, 999.99 Sale, 0.01 Payment)
{
  assert.strictEqual(toCents(0.10) + toCents(0.20), 30);
  assert.strictEqual(toTl(toCents(0.10) + toCents(0.20)), 0.30);
  assert.strictEqual(toCents(999.99), 99999);
  assert.strictEqual(toCents(0.01), 1);
  console.log('✔ Test 22 Passed: Integer Cents Precision Test (0.10 + 0.20 = 0.30 Exact)');
}

// Test 23: Zero Amount -> REJECT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: 0,
    reference_type: 'ORDER',
    reference_id: 'ord_zero',
    idempotency_key: 'idem_zero',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, 'İşlem tutarı sıfırdan büyük pozitif bir sayı olmalıdır.');
  console.log('✔ Test 23 Passed: Zero Amount Transaction Rejected');
}

// Test 24: Negative Amount -> REJECT
{
  const res = ledger.applyTransaction({
    account_id: 'acc_001',
    transaction_type: 'CREDIT_SALE',
    amount: -50,
    reference_type: 'ORDER',
    reference_id: 'ord_neg',
    idempotency_key: 'idem_neg',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, 'İşlem tutarı sıfırdan büyük pozitif bir sayı olmalıdır.');
  console.log('✔ Test 24 Passed: Negative Amount Transaction Rejected');
}

console.log('----------------------------------------------------');
console.log('ALL 24 EXTENDED REVOLVING CREDIT ASSERTION TESTS PASSED SUCCESSFULLY');
console.log('----------------------------------------------------');
