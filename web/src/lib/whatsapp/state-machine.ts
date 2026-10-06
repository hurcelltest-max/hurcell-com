/**
 * Paket O5 - WhatsApp Conversation State Machine Transition Engine (Gerçek Şema Hizalı)
 */

import { WhatsAppConversationState, WhatsAppConversationContext } from './types';
import { WhatsAppMessageTemplates } from './templates';

export interface StateTransitionResult {
  next_state: WhatsAppConversationState;
  outgoing_template: string;
  is_terminal: boolean;
  requires_human_approval: boolean;
}

// Full 17-State Transition Matrix & Handler Engine
export function computeStateTransition(
  ctx: WhatsAppConversationContext,
  userMessage: string
): StateTransitionResult {
  const trimmed = userMessage.trim();

  switch (ctx.current_state) {
    case 'NEW_MESSAGE':
      return {
        next_state: 'CUSTOMER_LOOKUP',
        outgoing_template: 'Müşteri sorgulanıyor...',
        is_terminal: false,
        requires_human_approval: false,
      };

    case 'CUSTOMER_LOOKUP':
      if (!ctx.customer || !ctx.customer.is_registered) {
        return {
          next_state: 'CUSTOMER_REGISTRATION_REQUIRED',
          outgoing_template: WhatsAppMessageTemplates.UNREGISTERED_PROMPT(),
          is_terminal: false,
          requires_human_approval: false,
        };
      }
      return {
        next_state: 'PRODUCT_SEARCH',
        outgoing_template: WhatsAppMessageTemplates.REGISTERED_WELCOME(ctx.customer.full_name),
        is_terminal: false,
        requires_human_approval: false,
      };

    case 'CUSTOMER_REGISTRATION_REQUIRED':
      return {
        next_state: 'CUSTOMER_REGISTRATION_IN_PROGRESS',
        outgoing_template: 'Lütfen ad ve soyadınızı giriniz.',
        is_terminal: false,
        requires_human_approval: false,
      };

    case 'CUSTOMER_REGISTRATION_IN_PROGRESS':
      return {
        next_state: 'CUSTOMER_IDENTIFIED',
        outgoing_template: `Teşekkürler ${trimmed}. Kaydınız taslak olarak oluşturuldu.`,
        is_terminal: false,
        requires_human_approval: false,
      };

    case 'CUSTOMER_IDENTIFIED':
    case 'PRODUCT_SEARCH':
      if (ctx.selected_product) {
        if (ctx.selected_product.stock === 0) {
          return {
            next_state: 'PRODUCT_SEARCH',
            outgoing_template: WhatsAppMessageTemplates.PRODUCT_OUT_OF_STOCK(ctx.selected_product.name),
            is_terminal: false,
            requires_human_approval: false,
          };
        }
        return {
          next_state: 'QUANTITY_REQUESTED',
          outgoing_template: WhatsAppMessageTemplates.PRODUCT_STOCK_INFO(
            ctx.selected_product.name,
            ctx.selected_product.price,
            ctx.selected_product.stock
          ),
          is_terminal: false,
          requires_human_approval: false,
        };
      }
      return {
        next_state: 'PRODUCT_SEARCH',
        outgoing_template: 'Lütfen aradığınız ürünün adını yazınız.',
        is_terminal: false,
        requires_human_approval: false,
      };

    case 'PRODUCT_SELECTED':
    case 'QUANTITY_REQUESTED':
      return {
        next_state: 'PAYMENT_METHOD_REQUESTED',
        outgoing_template: 'Ödeme yönteminizi seçiniz: 1. HurCELL Limit (Cari)  2. Peşin / Kapıda Ödeme',
        is_terminal: false,
        requires_human_approval: false,
      };

    case 'PAYMENT_METHOD_REQUESTED':
      if (ctx.payment_method === 'HURCELL_CREDIT') {
        return {
          next_state: 'CREDIT_CHECK',
          outgoing_template: 'HurCELL Limit hesabı ve kredi durumu denetleniyor...',
          is_terminal: false,
          requires_human_approval: false,
        };
      }
      return {
        next_state: 'AWAITING_CUSTOMER_CONFIRMATION',
        outgoing_template: 'Siparişinizi peşin ödeme ile onaylıyor musunuz? (Evet / Hayır)',
        is_terminal: false,
        requires_human_approval: false,
      };

    case 'CREDIT_CHECK':
      if (ctx.credit?.decision === 'PENDING_REVIEW') {
        return {
          next_state: 'AWAITING_CUSTOMER_CONFIRMATION',
          outgoing_template: WhatsAppMessageTemplates.CREDIT_PENDING_REVIEW(),
          is_terminal: false,
          requires_human_approval: true,
        };
      }
      return {
        next_state: 'AWAITING_CUSTOMER_CONFIRMATION',
        outgoing_template: WhatsAppMessageTemplates.CREDIT_RECORD_FOUND_MANUAL_REVIEW(),
        is_terminal: false,
        requires_human_approval: true,
      };

    case 'ORDER_SUMMARY':
    case 'AWAITING_CUSTOMER_CONFIRMATION':
      return {
        next_state: 'AWAITING_INTERNAL_APPROVAL',
        outgoing_template: WhatsAppMessageTemplates.ORDER_SUBMITTED_FOR_APPROVAL(),
        is_terminal: false,
        requires_human_approval: true,
      };

    case 'AWAITING_INTERNAL_APPROVAL':
      return {
        next_state: 'AWAITING_INTERNAL_APPROVAL',
        outgoing_template: 'Talebiniz yönetici onayında beklemektedir.',
        is_terminal: false,
        requires_human_approval: true,
      };

    case 'APPROVED':
      return {
        next_state: 'APPROVED',
        outgoing_template: WhatsAppMessageTemplates.ORDER_APPROVED(),
        is_terminal: true,
        requires_human_approval: false,
      };

    case 'REJECTED':
      return {
        next_state: 'REJECTED',
        outgoing_template: WhatsAppMessageTemplates.ORDER_REJECTED(),
        is_terminal: true,
        requires_human_approval: false,
      };

    case 'EXPIRED':
      return {
        next_state: 'EXPIRED',
        outgoing_template: 'Sipariş talebiniz zaman aşımına uğradı.',
        is_terminal: true,
        requires_human_approval: false,
      };

    case 'CANCELLED':
      return {
        next_state: 'CANCELLED',
        outgoing_template: 'Sipariş talebiniz iptal edildi.',
        is_terminal: true,
        requires_human_approval: false,
      };

    default:
      return {
        next_state: 'PRODUCT_SEARCH',
        outgoing_template: 'Nasıl yardımcı olabilirim?',
        is_terminal: false,
        requires_human_approval: false,
      };
  }
}
