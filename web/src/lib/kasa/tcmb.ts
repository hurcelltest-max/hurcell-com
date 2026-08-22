import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface ExchangeRateInfo {
  usdRate: number;
  eurRate: number;
  source: string;
  asOf: string;
  isFallback: boolean;
}

/**
 * TCMB Günlük Döviz Kurlarını Çeker (Server-Side)
 * Ağ hatası veya tatil günlerinde son geçerli veritabanı kuruna düşer (Graceful Fallback).
 */
export async function getTCMBExchangeRates(): Promise<ExchangeRateInfo> {
  const supabase = getSupabaseAdmin();

  try {
    const res = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 }, // 1 saatlik cache
    });

    if (res.ok) {
      const xmlText = await res.text();

      // USD Efektif Alış Parsing
      const usdMatch = xmlText.match(/<Currency\s+CrossOrder="\d+"\s+Kod="USD"\s+CurrencyCode="USD">[\s\S]*?<BanknoteBuying>([\d\.]+)<\/BanknoteBuying>/i) ||
                       xmlText.match(/<Currency\s+CrossOrder="\d+"\s+Kod="USD"\s+CurrencyCode="USD">[\s\S]*?<ForexBuying>([\d\.]+)<\/ForexBuying>/i);

      // EUR Efektif Alış Parsing
      const eurMatch = xmlText.match(/<Currency\s+CrossOrder="\d+"\s+Kod="EUR"\s+CurrencyCode="EUR">[\s\S]*?<BanknoteBuying>([\d\.]+)<\/BanknoteBuying>/i) ||
                       xmlText.match(/<Currency\s+CrossOrder="\d+"\s+Kod="EUR"\s+CurrencyCode="EUR">[\s\S]*?<ForexBuying>([\d\.]+)<\/ForexBuying>/i);

      if (usdMatch && eurMatch) {
        const usdRate = parseFloat(usdMatch[1]);
        const eurRate = parseFloat(eurMatch[1]);
        const asOf = new Date().toISOString();

        // Veritabanına snapshot kaydı at
        try {
          await supabase.from('kasa_exchange_rates').insert([
            { currency_code: 'USD', rate_numeric: usdRate, rate_source: 'TCMB Efektif Alış', rate_as_of: asOf },
            { currency_code: 'EUR', rate_numeric: eurRate, rate_source: 'TCMB Efektif Alış', rate_as_of: asOf },
          ]);
        } catch {
          // Ignore duplicate snapshot error
        }

        return {
          usdRate,
          eurRate,
          source: 'TCMB Efektif Alış',
          asOf,
          isFallback: false,
        };
      }
    }
  } catch {
    // TCMB erişim hatasında veritabanı fallback'ine geçilir
  }

  // Fallback: Veritabanındaki en son kaydedilmiş kuru çek
  const { data: usdData } = await supabase
    .from('kasa_exchange_rates')
    .select('*')
    .eq('currency_code', 'USD')
    .order('rate_as_of', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: eurData } = await supabase
    .from('kasa_exchange_rates')
    .select('*')
    .eq('currency_code', 'EUR')
    .order('rate_as_of', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (usdData && eurData) {
    return {
      usdRate: Number(usdData.rate_numeric),
      eurRate: Number(eurData.rate_numeric),
      source: usdData.rate_source || 'Son Geçerli Kayıtlı Kur',
      asOf: usdData.rate_as_of,
      isFallback: true,
    };
  }

  // Varsayılan Güvenli Başlangıç Kur Fallback'i
  return {
    usdRate: 40.00,
    eurRate: 45.00,
    source: 'Varsayılan Başlangıç Kuru',
    asOf: new Date().toISOString(),
    isFallback: true,
  };
}

/**
 * Yönetici Manuel Kur Güncelleme
 */
export async function saveManualExchangeRate(actorUserId: string, currencyCode: 'USD' | 'EUR', rateNumeric: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const asOf = new Date().toISOString();

  await supabase.from('kasa_exchange_rates').insert({
    currency_code: currencyCode,
    rate_numeric: rateNumeric,
    rate_source: 'Manuel Yönetici Kuru',
    rate_as_of: asOf,
    created_by_user_id: actorUserId,
  });

  await supabase.from('kasa_audit_logs').insert({
    user_id: actorUserId,
    action: 'manuel_kur_guncellendi',
    entity_type: 'kasa_exchange_rates',
    details: { currency_code: currencyCode, rate: rateNumeric, source: 'Manuel Yönetici Kuru' },
  });
}
