import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { createSaleTransaction, listDailySales, getOrCreateTodayDay } from '@/lib/kasa/service';

function sanitizeReference(ref: unknown): string | undefined {
  if (!ref) return undefined;
  let str = String(ref).trim().slice(0, 200);
  if (str.length === 0) return undefined;
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
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
      technical_service_details,
      idempotency_key,
    } = body;

    if (!category_id || !product_name || !quantity || !unit_price_tl) {
      return NextResponse.json(
        { error: 'Kategori, Ürün Adı, Miktar ve Birim Fiyat zorunludur.' },
        { status: 400 }
      );
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
    const serviceCostKurus = service_cost_tl ? Math.round(Number(service_cost_tl) * 100) : undefined;

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
      technical_service_details,
      idempotency_key: idempotency_key ? String(idempotency_key) : undefined,
    });

    return NextResponse.json({ success: true, sale });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Satış kaydı oluşturulamadı.' }, { status: 400 });
  }
}
