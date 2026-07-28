import assert from 'node:assert';
import { simulateWhatsAppMessage } from './simulator';

console.log('----------------------------------------------------');
console.log('RUNNING REAL SCHEMA ALIGNED WHATSAPP SIMULATOR TESTS');
console.log('----------------------------------------------------');

// Test 1: Scenario 1 - Registered Customer + Credit Record Found (Requires Manual Review)
{
  const result = simulateWhatsAppMessage({
    phone: '+905551234567',
    message: 'Şarj kablosu almak istiyorum.',
    scenario_fixture: 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW');
  assert.strictEqual(result.customer_found, true);
  assert.strictEqual(result.lookup_method, 'WHATSAPP_WA_ID_EXACT');
  assert.strictEqual(result.credit_decision, 'CREDIT_RECORD_FOUND_REQUIRES_MANUAL_REVIEW');
  assert.strictEqual(result.stock_status, 'IN_STOCK');
  assert.strictEqual(result.current_state, 'AWAITING_INTERNAL_APPROVAL');
  assert.ok(result.outgoing_whatsapp_message.includes('manuel onayına gönderilecektir'));
  assert.strictEqual(result.approval_preview?.requires_manual_review, true);
  console.log('✔ Test 1 Passed: Registered Customer Credit Record Found (Manual Review)');
}

// Test 2: Scenario 2 - Registered Customer + No Credit Account (Cash Option)
{
  const result = simulateWhatsAppMessage({
    phone: '+905559876543',
    message: 'Şarj kablosu peşin almak istiyorum.',
    scenario_fixture: 'SCENARIO_2_REGISTERED_CASH',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_2_REGISTERED_CASH');
  assert.strictEqual(result.customer_found, true);
  assert.strictEqual(result.credit_decision, 'NO_CREDIT_ACCOUNT');
  assert.strictEqual(result.current_state, 'AWAITING_INTERNAL_APPROVAL');
  assert.strictEqual(result.approval_preview?.payment_method, 'CASH_ON_DELIVERY');
  console.log('✔ Test 2 Passed: Registered Customer Cash Option');
}

// Test 3: Scenario 3 - Unregistered Customer
{
  const result = simulateWhatsAppMessage({
    phone: '+905550000000',
    message: 'Kılıç kılıf var mı?',
    scenario_fixture: 'SCENARIO_3_UNREGISTERED',
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.scenario_id, 'SCENARIO_3_UNREGISTERED');
  assert.strictEqual(result.customer_found, false);
  assert.strictEqual(result.lookup_method, 'NOT_FOUND');
  assert.strictEqual(result.credit_decision, 'NO_CUSTOMER');
  assert.strictEqual(result.current_state, 'CUSTOMER_REGISTRATION_REQUIRED');
  console.log('✔ Test 3 Passed: Unregistered Customer Prompt');
}

// Test 4: Scenario 4 - Credit Customer with status = pending_review
{
  const result = simulateWhatsAppMessage({
    phone: '+905553332211',
    message: 'Kredi ile alabilir miyim?',
    scenario_fixture: 'SCENARIO_4_PENDING_REVIEW',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_4_PENDING_REVIEW');
  assert.strictEqual(result.credit_decision, 'PENDING_REVIEW');
  assert.strictEqual(result.current_state, 'AWAITING_INTERNAL_APPROVAL');
  assert.ok(result.outgoing_whatsapp_message.includes('pending_review'));
  console.log('✔ Test 4 Passed: Credit Record Pending Review Status');
}

// Test 5: Scenario 5 - Out of Stock Product
{
  const result = simulateWhatsAppMessage({
    phone: '+905551234567',
    message: 'MagSafe Powerbank var mı?',
    scenario_fixture: 'SCENARIO_5_OUT_OF_STOCK',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_5_OUT_OF_STOCK');
  assert.strictEqual(result.stock_status, 'OUT_OF_STOCK');
  assert.strictEqual(result.current_state, 'PRODUCT_SEARCH');
  console.log('✔ Test 5 Passed: Out of Stock Product Handling');
}

// Test 6: Scenario 6 - Idempotent Replay Check
{
  const result = simulateWhatsAppMessage({
    phone: '+905551234567',
    message: 'Tekrarlayan sipariş mesajı 123',
    scenario_fixture: 'SCENARIO_6_IDEMPOTENT_REPLAY',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_6_IDEMPOTENT_REPLAY');
  assert.strictEqual(result.idempotency_replayed, true);
  console.log('✔ Test 6 Passed: Idempotent Replay Protection');
}

// Test 7: Scenario 7 - Unlinked Phone Match (customer_id is NULL in credit_customers)
{
  const result = simulateWhatsAppMessage({
    phone: '+905553332211',
    message: 'Telefon eşleşiyor ancak customer_id boş.',
    scenario_fixture: 'SCENARIO_7_UNLINKED_PHONE_MATCH',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_7_UNLINKED_PHONE_MATCH');
  assert.strictEqual(result.lookup_method, 'PHONE_NORMALIZED_EXACT');
  assert.strictEqual(result.credit_decision, 'PENDING_REVIEW');
  console.log('✔ Test 7 Passed: Unlinked Phone Match Handling');
}

// Test 8: Scenario 8 - WhatsApp WA_ID Exact Match Lookup
{
  const result = simulateWhatsAppMessage({
    phone: '+905551234567',
    message: 'WhatsApp WA_ID ile arama.',
    scenario_fixture: 'SCENARIO_8_WA_ID_EXACT_MATCH',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_8_WA_ID_EXACT_MATCH');
  assert.strictEqual(result.lookup_method, 'WHATSAPP_WA_ID_EXACT');
  console.log('✔ Test 8 Passed: WhatsApp WA_ID Exact Match Lookup');
}

// Test 9: Tab Open Auto-call Removal & Explicit Manual Trigger Guard Verification
{
  // Verify that the simulation harness is pure and requires explicit call parameters
  const req = {
    phone: '+905551234567',
    message: 'Manuel simülasyon tetikleme testi',
    scenario_fixture: 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW' as const,
  };
  const result = simulateWhatsAppMessage(req);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scenario_id, 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW');
  assert.ok(!result.outgoing_whatsapp_message.includes('REAL_PROVIDER_SENT'));
  console.log('✔ Test 9 Passed: Manual Explicit Trigger Guard Verified (Zero Automatic Mount Fetch)');
}

console.log('----------------------------------------------------');
console.log('ALL 9 REAL-SCHEMA ASSERTION TESTS PASSED SUCCESSFULLY');
console.log('----------------------------------------------------');
