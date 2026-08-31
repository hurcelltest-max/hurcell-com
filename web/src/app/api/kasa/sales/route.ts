import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { createSaleTransaction, listDailySales, getOrCreateTodayDay, getKasaCategoryById } from '@/lib/kasa/service';

function sanitizeReference(ref: unknown): string | undefined {
  if (!ref) return undefined;
  const str = String(ref).trim();
  if (str.length === 0) return undefined;
  if (str.length > 200) {
    throw new Error('Referans / Dekont Numarası en fazla 200 karakter olabilir.');
  }
  return str;
}

export async function GET(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const sales = await listDailySales(todayDay.id);

    const sanitizedSales = sales.map((s) => {
      if (auth.user.role === 'personel') {
        const { cost_price_kurus, ...rest } = s;
        return rest;
      }
      return s;
    });

    return NextResponse.json({ sales: sanitizedSales });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Satışlar alınamadı.' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireKasaAuth();
    const body = await req.json();

    const {
      category_id,
      product_name,
      brand,
      model,
      product_code,
      quantity,
      unit_price_tl,
      cash_paid_tl,
      card_paid_tl,
      bank_transfer_paid_tl,
      bank_transfer_reference,
      usd_paid,
      usd_rate,
      eur_paid,
      eur_rate,
      credit_paid_tl,
      credit_customer_id,
      description,
      customer_name,
      customer_phone,
      serial_imei,
      cost_price_tl,
      service_cost_tl,
      service_cost_payment_status,
      service_cost_payment_source,
      service_cost_bank_account_id,
      technical_service_details,
      idempotency_key,
    } = body;

    if (!idempotency_key || typeof idempotency_key !== 'string' || !idempotency_key.trim()) {
      return NextResponse.json({ error: 'EKSİK_İDEMPOTENCY_KEY: İşlem güvenliği için geçerli idempotency_key zorunludur.' }, { status: 400 });
    }

    if (!category_id || !product_name || !quantity || !unit_price_tl) {
      return NextResponse.json(
        { error: 'Kategori, Ürün Adı, Miktar ve Birim Fiyat zorunludur.' },
        { status: 400 }
      );
    }

    // Verify category from DB (server-side lookup)
    const category = await getKasaCategoryById(category_id);
    if (!category) {
      return NextResponse.json({ error: 'GEÇERSİZ_KATEGORİ: Seçilen kategori bulunamadı.' }, { status: 400 });
    }
    if (!category.is_active) {
      return NextResponse.json({ error: 'PASİF_KATEGORİ: Seçilen kategori aktif değildir.' }, { status: 400 });
    }

    const isTechnicalService = category.name === 'Teknik Servis';

    let finalPaymentStatus = service_cost_payment_status;
    let finalPaymentSource = service_cost_payment_source;
    let finalBankAccountId = service_cost_bank_account_id;

    if (isTechnicalService) {
      if (!finalPaymentStatus) {
        return NextResponse.json({ error: 'Teknik Servis maliyetinin nasıl karşılandığını seçiniz.' }, { status: 400 });
      }
      if (finalPaymentStatus === 'previously_paid_or_stock' || finalPaymentStatus === 'legacy_unspecified') {
        return NextResponse.json({ error: 'Yeni Teknik Servis satışında birleşik/belirsiz maliyet statüsü kullanılamaz.' }, { status: 400 });
      }
      if (finalPaymentStatus === 'paid_from_bank') {
        if (auth.user.role !== 'yonetici') {
          return NextResponse.json({ error: 'BANKA_ÖDEMESİ_YETKİSİZ: Bankadan maliyet ödemesi yalnız yönetici yetkisindedir.' }, { status: 403 });
        }
        if (!finalBankAccountId) {
          return NextResponse.json({ error: 'Bankadan ödenen Teknik Servis maliyeti için aktif bir TRY banka hesabı seçiniz.' }, { status: 400 });
        }
      }
      finalPaymentSource = finalPaymentStatus === 'paid_from_bank' ? 'bank'
                           : finalPaymentStatus === 'paid_from_cash' ? 'cash'
                           : finalPaymentStatus === 'used_from_stock' ? 'stock'
                           : finalPaymentStatus === 'previously_paid' ? 'previously_paid'
                           : finalPaymentStatus === 'no_cost' ? 'none'
                           : undefined;
    } else {
      // Normal sales: clear TS-specific fields
      finalPaymentStatus = undefined;
      finalPaymentSource = undefined;
      finalBankAccountId = undefined;
    }

    const unitPriceKurus = Math.round(Number(unit_price_tl) * 100);
    const cashPaidKurus = cash_paid_tl ? Math.round(Number(cash_paid_tl) * 100) : 0;
    const cardPaidKurus = card_paid_tl ? Math.round(Number(card_paid_tl) * 100) : 0;
    const bankTransferPaidKurus = bank_transfer_paid_tl ? Math.round(Number(bank_transfer_paid_tl) * 100) : 0;
    const creditPaidKurus = credit_paid_tl ? Math.round(Number(credit_paid_tl) * 100) : 0;

    const usdPaidCents = usd_paid ? Math.round(Number(usd_paid) * 100) : 0;
    const usdRateNum = usd_rate ? Number(usd_rate) : undefined;
    const usdTLEquivalentKurus = usdPaidCents > 0 && usdRateNum ? Math.round((usdPaidCents / 100.0) * usdRateNum * 100) : 0;

    const eurPaidCents = eur_paid ? Math.round(Number(eur_paid) * 100) : 0;
    const eurRateNum = eur_rate ? Number(eur_rate) : undefined;
    const eurTLEquivalentKurus = eurPaidCents > 0 && eurRateNum ? Math.round((eurPaidCents / 100.0) * eurRateNum * 100) : 0;

    const costPriceKurus = cost_price_tl ? Math.round(Number(cost_price_tl) * 100) : undefined;
    const serviceCostKurus = isTechnicalService && service_cost_tl ? Math.round(Number(service_cost_tl) * 100) : undefined;

    const sale = await createSaleTransaction(auth.user.id, {
      category_id,
      product_name: String(product_name).trim(),
      brand: brand ? String(brand).trim() : undefined,
      model: model ? String(model).trim() : undefined,
      product_code: product_code ? String(product_code).trim() : undefined,
      quantity: Number(quantity),
      unit_price_kurus: unitPriceKurus,
      cash_paid_kurus: cashPaidKurus,
      card_paid_kurus: cardPaidKurus,
      bank_transfer_paid_kurus: bankTransferPaidKurus,
      bank_transfer_reference: sanitizeReference(bank_transfer_reference),
      credit_paid_kurus: creditPaidKurus,
      credit_customer_id: credit_customer_id ? String(credit_customer_id) : undefined,
      usd_paid_cents: usdPaidCents,
      usd_rate: usdRateNum,
      usd_tl_equivalent_kurus: usdTLEquivalentKurus,
      eur_paid_cents: eurPaidCents,
      eur_rate: eurRateNum,
      eur_tl_equivalent_kurus: eurTLEquivalentKurus,
      description: description ? String(description).trim() : undefined,
      customer_name: customer_name ? String(customer_name).trim() : undefined,
      customer_phone: customer_phone ? String(customer_phone).trim() : undefined,
      serial_imei: serial_imei ? String(serial_imei).trim() : undefined,
      cost_price_kurus: costPriceKurus,
      service_cost_kurus: serviceCostKurus,
      service_cost_payment_status: finalPaymentStatus ? String(finalPaymentStatus) as any : undefined,
      service_cost_payment_source: finalPaymentSource ? String(finalPaymentSource) as any : undefined,
      service_cost_bank_account_id: finalBankAccountId,
      technical_service_details: isTechnicalService ? technical_service_details : undefined,
      idempotency_key: idempotency_key ? String(idempotency_key) : undefined,
    });

    return NextResponse.json({ success: true, sale });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Satış oluşturulamadı.' }, { status: 400 });
  }
}
