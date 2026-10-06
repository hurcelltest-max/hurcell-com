/**
 * Paket O5 - WhatsApp Order Engine Simulation Harness (Read-Only Dev Simulator - Gerçek Şema Hizalı)
 */

import {
  WhatsAppSimulationRequest,
  WhatsAppSimulationResult,
  WhatsAppCustomerProfile,
  WhatsAppCreditInfo,
  WhatsAppProductQuery,
  WhatsAppApprovalPayload,
  WhatsAppNotificationOutboxItem,
} from './types';
import { WhatsAppMessageTemplates } from './templates';

// Pre-configured Test Fixture Profiles (Strictly aligned with real database schema)
const FIXTURE_CUSTOMERS: Record<string, WhatsAppCustomerProfile> = {
  AHMET_YILMAZ: {
    id: 'c-cust-001-uuid',
    full_name: 'Ahmet Yılmaz',
    phone_normalized: '905551234567', // Internal 12-digit canonical
    whatsapp_wa_id: 'wa_id_905551234567', // External WhatsApp ID
    phone_masked: '+90 555 *** 45 67',
    is_registered: true,
    status: 'ACTIVE',
    registration_source: 'STORE_POS',
  },
  MEHMET_DEMIR: {
    id: 'c-cust-002-uuid',
    full_name: 'Mehmet Demir',
    phone_normalized: '905559876543',
    whatsapp_wa_id: null,
    phone_masked: '+90 555 *** 65 43',
    is_registered: true,
    status: 'ACTIVE',
    registration_source: 'WEB_SIGNUP',
  },
  CANAN_KAYA: {
    id: 'c-cust-003-uuid',
    full_name: 'Canan Kaya',
    phone_normalized: '905553332211',
    whatsapp_wa_id: 'wa_id_905553332211',
    phone_masked: '+90 555 *** 22 11',
    is_registered: true,
    status: 'ACTIVE',
    registration_source: 'LIMITLI_ALISVERIS_APP',
  },
};

const FIXTURE_CREDITS: Record<string, WhatsAppCreditInfo> = {
  RECORD_FOUND_MANUAL_REVIEW: {
    credit_customer_id: 'cc-001-uuid',
    customer_id_linked: true,
    status: 'active',
    phone_matched: true,
    decision: 'CREDIT_RECORD_FOUND_REQUIRES_MANUAL_REVIEW',
    requires_manual_review: true,
  },
  PENDING_REVIEW: {
    credit_customer_id: 'cc-003-uuid',
    customer_id_linked: true,
    status: 'pending_review', // Real default schema status
    phone_matched: true,
    decision: 'PENDING_REVIEW',
    requires_manual_review: true,
  },
  UNLINKED_PHONE_MATCH: {
    credit_customer_id: 'cc-004-uuid',
    customer_id_linked: false, // customer_id is NULL in credit_customers!
    status: 'pending_review',
    phone_matched: true, // But phone_normalized matches customers.phone_normalized!
    decision: 'PENDING_REVIEW',
    requires_manual_review: true,
  },
  NO_CREDIT_ACCOUNT: {
    credit_customer_id: null,
    customer_id_linked: false,
    status: null,
    phone_matched: false,
    decision: 'NO_CREDIT_ACCOUNT',
    requires_manual_review: false,
  },
};

const FIXTURE_PRODUCTS: Record<string, WhatsAppProductQuery> = {
  TYPEC_CABLE: {
    id: '8812a0f1-0001-uuid',
    name: 'HurCELL Type-C Örgülü Şarj Kablosu 1m',
    sku: 'AKS-KBL-001',
    price: 180,
    stock: 42,
    is_active: true,
    whatsapp_enabled: true,
    is_web_visible: true,
    short_description: '1m Örgülü Type-C Hızlı Şarj Kablosu',
  },
  POWERBANK_OUT_OF_STOCK: {
    id: '8812a0f1-0005-uuid',
    name: 'HurCELL MagSafe Kablosuz Powerbank',
    sku: 'AKS-PWR-005',
    price: 650,
    stock: 0,
    is_active: true,
    whatsapp_enabled: true,
    is_web_visible: true,
    short_description: '10000mAh MagSafe Kablosuz Şarj Cihazı',
  },
};

// In-memory idempotency cache for simulation harness
const SIMULATION_REPLAY_CACHE = new Set<string>();

export function simulateWhatsAppMessage(
  req: WhatsAppSimulationRequest
): WhatsAppSimulationResult {
  const scenarioKey = req.scenario_fixture || 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW';

  // Scenario 6: Idempotent Replay Check
  if (scenarioKey === 'SCENARIO_6_IDEMPOTENT_REPLAY' || SIMULATION_REPLAY_CACHE.has(req.message)) {
    SIMULATION_REPLAY_CACHE.add(req.message);
    const customer = FIXTURE_CUSTOMERS.AHMET_YILMAZ;
    const product = FIXTURE_PRODUCTS.TYPEC_CABLE;

    return {
      success: true,
      scenario_id: 'SCENARIO_6_IDEMPOTENT_REPLAY',
      phone_canonical: customer.phone_normalized,
      whatsapp_wa_id: customer.whatsapp_wa_id || undefined,
      customer_found: true,
      lookup_method: 'WHATSAPP_WA_ID_EXACT',
      customer,
      credit_decision: 'CREDIT_RECORD_FOUND_REQUIRES_MANUAL_REVIEW',
      selected_product: product,
      stock_status: 'IN_STOCK',
      current_state: 'AWAITING_INTERNAL_APPROVAL',
      outgoing_whatsapp_message: WhatsAppMessageTemplates.ORDER_SUBMITTED_FOR_APPROVAL(),
      idempotency_replayed: true,
    };
  }

  // SCENARIO 3: Customer Not Found
  if (scenarioKey === 'SCENARIO_3_UNREGISTERED' || req.phone.includes('0000')) {
    return {
      success: false,
      scenario_id: 'SCENARIO_3_UNREGISTERED',
      phone_canonical: '905550000000',
      customer_found: false,
      lookup_method: 'NOT_FOUND',
      credit_decision: 'NO_CUSTOMER',
      stock_status: 'OUT_OF_STOCK',
      current_state: 'CUSTOMER_REGISTRATION_REQUIRED',
      outgoing_whatsapp_message: WhatsAppMessageTemplates.UNREGISTERED_PROMPT(),
      idempotency_replayed: false,
    };
  }

  // SCENARIO 8: WhatsApp WA ID Exact Match Lookup Precedence
  if (scenarioKey === 'SCENARIO_8_WA_ID_EXACT_MATCH') {
    const customer = FIXTURE_CUSTOMERS.AHMET_YILMAZ;
    const product = FIXTURE_PRODUCTS.TYPEC_CABLE;

    return {
      success: true,
      scenario_id: 'SCENARIO_8_WA_ID_EXACT_MATCH',
      phone_canonical: customer.phone_normalized,
      whatsapp_wa_id: customer.whatsapp_wa_id || undefined,
      customer_found: true,
      lookup_method: 'WHATSAPP_WA_ID_EXACT',
      customer,
      credit_decision: 'CREDIT_RECORD_FOUND_REQUIRES_MANUAL_REVIEW',
      selected_product: product,
      stock_status: 'IN_STOCK',
      current_state: 'AWAITING_INTERNAL_APPROVAL',
      outgoing_whatsapp_message: WhatsAppMessageTemplates.CREDIT_RECORD_FOUND_MANUAL_REVIEW(),
      idempotency_replayed: false,
    };
  }

  // SCENARIO 7: Unlinked Phone Match (customer_id is NULL in credit_customers)
  if (scenarioKey === 'SCENARIO_7_UNLINKED_PHONE_MATCH') {
    const customer = FIXTURE_CUSTOMERS.CANAN_KAYA;
    const credit = FIXTURE_CREDITS.UNLINKED_PHONE_MATCH;

    return {
      success: true,
      scenario_id: 'SCENARIO_7_UNLINKED_PHONE_MATCH',
      phone_canonical: customer.phone_normalized,
      customer_found: true,
      lookup_method: 'PHONE_NORMALIZED_EXACT',
      customer,
      credit_decision: credit.decision,
      stock_status: 'IN_STOCK',
      current_state: 'AWAITING_INTERNAL_APPROVAL',
      outgoing_whatsapp_message: WhatsAppMessageTemplates.CREDIT_PENDING_REVIEW(),
      idempotency_replayed: false,
    };
  }

  // SCENARIO 5: Out of Stock Product
  if (scenarioKey === 'SCENARIO_5_OUT_OF_STOCK') {
    const customer = FIXTURE_CUSTOMERS.AHMET_YILMAZ;
    const product = FIXTURE_PRODUCTS.POWERBANK_OUT_OF_STOCK;

    return {
      success: true,
      scenario_id: 'SCENARIO_5_OUT_OF_STOCK',
      phone_canonical: customer.phone_normalized,
      customer_found: true,
      lookup_method: 'PHONE_NORMALIZED_EXACT',
      customer,
      credit_decision: 'CREDIT_RECORD_FOUND_REQUIRES_MANUAL_REVIEW',
      selected_product: product,
      stock_status: 'OUT_OF_STOCK',
      current_state: 'PRODUCT_SEARCH',
      outgoing_whatsapp_message: WhatsAppMessageTemplates.PRODUCT_OUT_OF_STOCK(product.name),
      idempotency_replayed: false,
    };
  }

  // SCENARIO 4: Credit Customer with Status = pending_review
  if (scenarioKey === 'SCENARIO_4_PENDING_REVIEW') {
    const customer = FIXTURE_CUSTOMERS.CANAN_KAYA;
    const credit = FIXTURE_CREDITS.PENDING_REVIEW;

    return {
      success: true,
      scenario_id: 'SCENARIO_4_PENDING_REVIEW',
      phone_canonical: customer.phone_normalized,
      customer_found: true,
      lookup_method: 'PHONE_NORMALIZED_EXACT',
      customer,
      credit_decision: credit.decision,
      stock_status: 'IN_STOCK',
      current_state: 'AWAITING_INTERNAL_APPROVAL',
      outgoing_whatsapp_message: WhatsAppMessageTemplates.CREDIT_PENDING_REVIEW(),
      idempotency_replayed: false,
    };
  }

  // SCENARIO 2: Cash Option (No Credit Customer)
  if (scenarioKey === 'SCENARIO_2_REGISTERED_CASH') {
    const customer = FIXTURE_CUSTOMERS.MEHMET_DEMIR;
    const product = FIXTURE_PRODUCTS.TYPEC_CABLE;
    const approvalId = `appr_${Date.now()}_002`;

    const approvalPreview: WhatsAppApprovalPayload = {
      approval_id: approvalId,
      approval_type: 'WHATSAPP_ORDER',
      status: 'PENDING',
      customer_id: customer.id,
      customer_name: customer.full_name,
      customer_phone_masked: customer.phone_masked,
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      quantity: 1,
      unit_price: product.price,
      total_amount: product.price,
      stock_snapshot: product.stock,
      payment_method: 'CASH_ON_DELIVERY',
      credit_status: 'NO_CREDIT_ACCOUNT',
      requires_manual_review: true,
      conversation_id: `conv_${Date.now()}_002`,
      created_at: new Date().toISOString(),
    };

    return {
      success: true,
      scenario_id: 'SCENARIO_2_REGISTERED_CASH',
      phone_canonical: customer.phone_normalized,
      customer_found: true,
      lookup_method: 'PHONE_NORMALIZED_EXACT',
      customer,
      credit_decision: 'NO_CREDIT_ACCOUNT',
      selected_product: product,
      stock_status: 'IN_STOCK',
      current_state: 'AWAITING_INTERNAL_APPROVAL',
      outgoing_whatsapp_message: WhatsAppMessageTemplates.ORDER_SUBMITTED_FOR_APPROVAL(),
      approval_preview: approvalPreview,
      idempotency_replayed: false,
    };
  }

  // DEFAULT / SCENARIO 1: Registered Customer + Credit Record Found (Manual Review Required)
  const customer = FIXTURE_CUSTOMERS.AHMET_YILMAZ;
  const credit = FIXTURE_CREDITS.RECORD_FOUND_MANUAL_REVIEW;
  const product = FIXTURE_PRODUCTS.TYPEC_CABLE;
  const approvalId = `appr_${Date.now()}_001`;

  const approvalPreview: WhatsAppApprovalPayload = {
    approval_id: approvalId,
    approval_type: 'WHATSAPP_ORDER',
    status: 'PENDING',
    customer_id: customer.id,
    customer_name: customer.full_name,
    customer_phone_masked: customer.phone_masked,
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    quantity: 1,
    unit_price: product.price,
    total_amount: product.price,
    stock_snapshot: product.stock,
    payment_method: 'HURCELL_CREDIT',
    credit_status: credit.decision,
    requires_manual_review: true,
    conversation_id: `conv_${Date.now()}_001`,
    created_at: new Date().toISOString(),
  };

  const notificationPreview: WhatsAppNotificationOutboxItem = {
    id: `notif_${Date.now()}_001`,
    channel: 'OPERATIONS_UI',
    destination: 'OPERATIONS_APPROVALS_TAB',
    event_type: 'WHATSAPP_ORDER_PENDING_APPROVAL',
    payload: approvalPreview as unknown as Record<string, unknown>,
    status: 'QUEUED',
    created_at: new Date().toISOString(),
  };

  return {
    success: true,
    scenario_id: 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW',
    phone_canonical: customer.phone_normalized,
    whatsapp_wa_id: customer.whatsapp_wa_id || undefined,
    customer_found: true,
    lookup_method: 'WHATSAPP_WA_ID_EXACT',
    customer,
    credit_decision: credit.decision,
    selected_product: product,
    stock_status: 'IN_STOCK',
    current_state: 'AWAITING_INTERNAL_APPROVAL',
    outgoing_whatsapp_message: WhatsAppMessageTemplates.CREDIT_RECORD_FOUND_MANUAL_REVIEW(),
    internal_notification_preview: notificationPreview,
    approval_preview: approvalPreview,
    idempotency_replayed: false,
  };
}
