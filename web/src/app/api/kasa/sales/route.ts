import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { createSaleTransaction, listDailySales, getOrCreateTodayDay } from '@/lib/kasa/service';

export async function GET() {
  try {
    const auth = await requireKasaAuth();
    const todayDay = await getOrCreateTodayDay(auth.user.id);
    const sales = await listDailySales(todayDay.id);

    const sanitizedSales = sales.map((sale) => {
      if (auth.user.role === 'personel') {
        const { cost_price_kurus, ...rest } = sale;
        return rest;
      }
      return sale;
    });

    return NextResponse.json({ sales: sanitizedSales });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Yetkisiz erişim.' }, { status: 401 });
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
      usd_paid,
      usd_rate,
      eur_paid,
      eur_rate,
      description,
      customer_name,
      customer_phone,
      serial_imei,
      cost_price_tl,
      service_cost_tl,
      technical_service_details,
      idempotency_key,
    } = body;

    if (!category_id || !product_name || !quantity || unit_price_tl === undefined) {
      return NextResponse.json({ error: 'Lütfen zorunlu alanları doldurun.' }, { status: 400 });
    }

    const qty = Number(quantity);
    const unitPriceKurus = Math.round(Number(unit_price_tl) * 100);
    const cashPaidKurus = Math.round(Number(cash_paid_tl || 0) * 100);
    const cardPaidKurus = Math.round(Number(card_paid_tl || 0) * 100);

    const usdPaidCents = Math.round(Number(usd_paid || 0) * 100);
    const usdRateNum = usd_rate ? Number(usd_rate) : undefined;
    const usdTLEquivalentKurus = usdPaidCents > 0 && usdRateNum ? Math.round((usdPaidCents / 100.0) * usdRateNum * 100) : 0;

    const eurPaidCents = Math.round(Number(eur_paid || 0) * 100);
    const eurRateNum = eur_rate ? Number(eur_rate) : undefined;
    const eurTLEquivalentKurus = eurPaidCents > 0 && eurRateNum ? Math.round((eurPaidCents / 100.0) * eurRateNum * 100) : 0;

    const costPriceKurus = cost_price_tl !== undefined && cost_price_tl !== null && cost_price_tl !== ''
      ? Math.round(Number(cost_price_tl) * 100)
      : undefined;

    const serviceCostKurus = service_cost_tl !== undefined && service_cost_tl !== null && service_cost_tl !== ''
      ? Math.round(Number(service_cost_tl) * 100)
      : undefined;

    const sale = await createSaleTransaction(auth.user.id, {
      category_id,
      product_name: String(product_name).trim(),
      brand: brand ? String(brand).trim() : undefined,
      model: model ? String(model).trim() : undefined,
      product_code: product_code ? String(product_code).trim() : undefined,
      quantity: qty,
      unit_price_kurus: unitPriceKurus,
      cash_paid_kurus: cashPaidKurus,
      card_paid_kurus: cardPaidKurus,
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
      idempotency_key: idempotency_key ? String(idempotency_key).trim() : undefined,
    });

    return NextResponse.json({ success: true, sale });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Satış kaydı oluşturulamadı.' }, { status: 400 });
  }
}
