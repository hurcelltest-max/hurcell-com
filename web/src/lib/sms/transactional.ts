import { getSmsProvider } from './mock-provider';
import { normalizeTurkishPhoneNumber } from './phone';
import { maskPhone } from './netgsm-provider';
import { supabaseAdmin } from '@/lib/supabase/admin';

type RecipientType = 'customer' | 'internal';
type EventType = 'order_created' | 'order_shipped' | 'order_delivered' | 'delivery_failed' | 'return_requested';

export interface SmsTemplateData {
  order_number: string;
  amount?: string;
  city?: string;
  district?: string;
  cargo_company?: string;
  tracking_number?: string;
}

export async function sendTransactionalSms(
  orderId: string,
  event: EventType,
  recipientType: RecipientType,
  rawPhone: string,
  data: SmsTemplateData
): Promise<{ success: boolean; skipped?: boolean }> {
  try {
    const dedupeKey = `order:${orderId}:${recipientType}:${event}`;
    const phone = normalizeTurkishPhoneNumber(rawPhone);
    const message = generateMessage(event, recipientType, data);

    // 1. Deduplication & Retry Lock
    // We try to select the existing record first.
    // If it exists:
    // - If status is 'sent' or 'pending', we do nothing.
    // - If status is 'failed' AND next_retry_at <= now(), we update status to pending and increment attempt_count.
    // If it does NOT exist, we try to insert a new pending record.
    // If insert fails with unique_violation, it means another parallel process inserted it, so we skip.

    let logEntryId: string;
    
    const { data: existing } = await supabaseAdmin
      .from('sms_notifications')
      .select('*')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'sent') {
        console.log(`[SMS DEDUPE] Skipping duplicate SMS for key: ${dedupeKey}`);
        return { success: true, skipped: true };
      }
      
      const now = new Date();
      
      if (existing.status === 'pending') {
        const lastAttempt = existing.last_attempt_at ? new Date(existing.last_attempt_at) : null;
        if (lastAttempt && (now.getTime() - lastAttempt.getTime()) < 5 * 60 * 1000) {
          console.log(`[SMS DEDUPE] Skipping pending, still processing for key: ${dedupeKey}`);
          return { success: true, skipped: true };
        }
        // Stale pending -> retry
      } else if (existing.status === 'failed') {
        const nextRetry = existing.next_retry_at ? new Date(existing.next_retry_at) : null;
        if (nextRetry && nextRetry > now) {
          console.log(`[SMS DEDUPE] Skipping retry, next_retry_at not reached yet for key: ${dedupeKey}`);
          return { success: false, skipped: true };
        }
      } else if (existing.status === 'skipped') {
         // Should we retry skipped? Usually no.
         return { success: true, skipped: true };
      }
      
      // Safe to retry (stale pending or valid failed)
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('sms_notifications')
        .update({
          status: 'pending',
          attempt_count: existing.attempt_count + 1,
          last_attempt_at: now.toISOString(),
          next_retry_at: null,
          error_message: null
        })
        .eq('id', existing.id)
        .in('status', ['pending', 'failed']) // optimistic locking
        .select('id')
        .single();
        
      if (updateErr || !updated) {
         return { success: false }; // Someone else might have retried
      }
      logEntryId = updated.id;
    } else {
      const { data: logEntry, error: insertError } = await supabaseAdmin
        .from('sms_notifications')
        .insert({
          order_id: orderId,
          recipient_type: recipientType,
          recipient_phone: phone,
          event_type: event,
          dedupe_key: dedupeKey,
          status: 'pending',
          metadata: data,
          attempt_count: 1,
          last_attempt_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (insertError) {
        if (insertError.code === '23505') { // unique_violation
          console.log(`[SMS DEDUPE] Parallel insert caught for key: ${dedupeKey}`);
          return { success: true, skipped: true };
        }
        console.error('[SMS DEDUPE ERROR]', insertError);
        return { success: false };
      }
      logEntryId = logEntry.id;
    }

    // 2. Send SMS
    const provider = getSmsProvider();
    let status = 'sent';
    let errorMessage = null;
    let providerMessageId = null;

    try {
      const result = await provider.sendSms(phone, message);
      providerMessageId = result.messageId;
    } catch (err: unknown) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : 'Unknown provider error';
      console.error(`[SMS SEND ERROR] To: ${maskPhone(phone)}, Event: ${event}`, err);
    }

    // 3. Update Log
    // If failed, schedule next retry (e.g. 5 mins later, or exponential backoff)
    const updatePayload: Record<string, string | null> = {
      status,
      provider_message_id: providerMessageId,
      error_message: errorMessage,
    };
    
    if (status === 'sent') {
      updatePayload.sent_at = new Date().toISOString();
    } else {
      updatePayload.next_retry_at = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // Retry after 5 mins
    }

    await supabaseAdmin
      .from('sms_notifications')
      .update(updatePayload)
      .eq('id', logEntryId);

    return { success: status === 'sent' };
  } catch (err) {
    console.error(`[SMS FATAL ERROR] Event: ${event}`, err);
    return { success: false };
  }
}

function generateMessage(event: EventType, type: RecipientType, data: SmsTemplateData): string {
  switch (event) {
    case 'order_created':
      if (type === 'customer') {
        return `Siparisiniz alindi. Sip. No: ${data.order_number}, Tutar: ${data.amount} TL (Kapida Odeme). HurCELL`;
      }
      return `Yeni Siparis! No: ${data.order_number}, Il-Ilce: ${data.city}-${data.district}, Tutar: ${data.amount} TL.`;

    case 'order_shipped':
      if (type === 'customer') {
        return `Siparisiniz kargoya verildi. Takip: ${data.tracking_number}. HurCELL`;
      }
      return `Kargo Cikisi: Siparis ${data.order_number} ${data.cargo_company} ile kargolandi. Takip: ${data.tracking_number}.`;

    case 'order_delivered':
      if (type === 'customer') {
        return `Siparisiniz teslim edilmistir. Bizi tercih ettiginiz icin tesekkur ederiz. HurCELL`;
      }
      return `Teslimat Basarili: Siparis ${data.order_number} teslim edildi.`;

    case 'delivery_failed':
      if (type === 'customer') {
        return `Siparisiniz teslim edilemedi veya iade ediliyor. Bilgi icin iletisime geciniz. HurCELL`;
      }
      return `ACIL UYARI! Teslimat Basarisiz: Siparis ${data.order_number}. Stok iadesi tetiklendi.`;

    case 'return_requested':
      if (type === 'customer') {
        return `Iade talebiniz alinmistir. HurCELL`;
      }
      return `YENI IADE TALEBI: Siparis ${data.order_number}, Musteri Il-Ilce: ${data.city}-${data.district}.`;
      
    default:
      return `HurCELL Bildirim: ${data.order_number}`;
  }
}

export function getInternalAlertPhones(): string[] {
  const envVar = process.env.SMS_INTERNAL_ALERT_PHONES;
  if (!envVar) return [];
  return envVar.split(',').map(p => p.trim()).filter(Boolean);
}
