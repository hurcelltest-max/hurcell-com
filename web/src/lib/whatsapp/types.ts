/**
 * Paket O5 - WhatsApp Müşteri, Kredi, Stok ve Onay Pilotu Tip Tanımları (Gerçek Şema Hizalı)
 */

export type WhatsAppConversationState =
  | 'NEW_MESSAGE'
  | 'CUSTOMER_LOOKUP'
  | 'CUSTOMER_REGISTRATION_REQUIRED'
  | 'CUSTOMER_REGISTRATION_IN_PROGRESS'
  | 'CUSTOMER_IDENTIFIED'
  | 'PRODUCT_SEARCH'
  | 'PRODUCT_SELECTED'
  | 'QUANTITY_REQUESTED'
  | 'PAYMENT_METHOD_REQUESTED'
  | 'CREDIT_CHECK'
  | 'ORDER_SUMMARY'
  | 'AWAITING_CUSTOMER_CONFIRMATION'
  | 'AWAITING_INTERNAL_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type PaymentMethod = 'CASH_ON_DELIVERY' | 'HURCELL_CREDIT' | 'CREDIT_CARD_STORE';

// Gerçek Supabase şeması doğrultusunda yalnız geçerli karar durumları:
export type CreditDecisionType =
  | 'NO_CUSTOMER' // public.customers içinde müşteri yok
  | 'NO_CREDIT_ACCOUNT' // Müşteri var ancak public.credit_customers kaydı yok
  | 'PENDING_REVIEW' // credit_customers kaydı var, status = pending_review
  | 'CREDIT_RECORD_FOUND_REQUIRES_MANUAL_REVIEW'; // credit_customers kaydı var, manuel onay gerekli

export interface WhatsAppCustomerProfile {
  id: string;
  full_name: string;
  phone_normalized: string; // 905XXXXXXXXX internal canonical
  whatsapp_wa_id: string | null; // external WhatsApp ID
  phone_masked: string;
  is_registered: boolean;
  status: string; // DEFAULT 'ACTIVE'
  registration_source?: string;
}

export interface WhatsAppCreditInfo {
  credit_customer_id: string | null;
  customer_id_linked: boolean;
  status: string | null; // Real DB status field (DEFAULT 'pending_review')
  phone_matched: boolean;
  decision: CreditDecisionType;
  requires_manual_review: boolean;
}

export interface WhatsAppProductQuery {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  is_active: boolean;
  whatsapp_enabled: boolean;
  is_web_visible: boolean;
  short_description?: string;
}

export interface WhatsAppConversationContext {
  conversation_id: string;
  phone_raw: string;
  phone_canonical: string;
  whatsapp_wa_id?: string;
  current_state: WhatsAppConversationState;
  customer?: WhatsAppCustomerProfile;
  credit?: WhatsAppCreditInfo;
  selected_product?: WhatsAppProductQuery;
  requested_quantity?: number;
  payment_method?: PaymentMethod;
  total_amount?: number;
  approval_id?: string;
  idempotency_key: string;
  created_at: string;
  last_message_at: string;
}

export interface WhatsAppApprovalPayload {
  approval_id: string;
  approval_type: 'WHATSAPP_ORDER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  customer_id: string;
  customer_name: string;
  customer_phone_masked: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  stock_snapshot: number;
  payment_method: PaymentMethod;
  credit_status: CreditDecisionType;
  requires_manual_review: boolean;
  conversation_id: string;
  created_at: string;
}

export interface WhatsAppNotificationOutboxItem {
  id: string;
  channel: 'OPERATIONS_UI' | 'ADMIN_SMS' | 'ADMIN_WHATSAPP';
  destination: string;
  event_type: 'WHATSAPP_ORDER_PENDING_APPROVAL' | 'WHATSAPP_ORDER_APPROVED' | 'WHATSAPP_ORDER_REJECTED';
  payload: Record<string, unknown>;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  created_at: string;
}

export interface WhatsAppSimulationRequest {
  phone: string;
  message: string;
  scenario_fixture?:
    | 'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW'
    | 'SCENARIO_2_REGISTERED_CASH'
    | 'SCENARIO_3_UNREGISTERED'
    | 'SCENARIO_4_PENDING_REVIEW'
    | 'SCENARIO_5_OUT_OF_STOCK'
    | 'SCENARIO_6_IDEMPOTENT_REPLAY'
    | 'SCENARIO_7_UNLINKED_PHONE_MATCH'
    | 'SCENARIO_8_WA_ID_EXACT_MATCH';
}

export interface WhatsAppSimulationResult {
  success: boolean;
  scenario_id: string;
  phone_canonical: string; // 905XXXXXXXXX internal
  whatsapp_wa_id?: string;
  customer_found: boolean;
  lookup_method?: 'WHATSAPP_WA_ID_EXACT' | 'PHONE_NORMALIZED_EXACT' | 'CREDIT_CUSTOMER_PHONE_FALLBACK' | 'NOT_FOUND';
  customer?: WhatsAppCustomerProfile;
  credit_decision: CreditDecisionType;
  selected_product?: WhatsAppProductQuery;
  stock_status: 'IN_STOCK' | 'CRITICAL_STOCK' | 'OUT_OF_STOCK';
  current_state: WhatsAppConversationState;
  outgoing_whatsapp_message: string;
  internal_notification_preview?: WhatsAppNotificationOutboxItem;
  approval_preview?: WhatsAppApprovalPayload;
  idempotency_replayed: boolean;
}
