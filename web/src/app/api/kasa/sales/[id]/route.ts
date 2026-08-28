import { NextResponse } from 'next/server';
import { requireKasaAuth } from '@/lib/kasa/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireKasaAuth();
    const { id: saleId } = await params;

    const supabase = getSupabaseAdmin();
    const { data: sale, error } = await supabase
      .from('kasa_sales')
      .select(`
        *,
        kasa_days!inner(status),
        category:kasa_categories(name)
      `)
      .eq('id', saleId)
      .single();

    if (error || !sale) {
      return NextResponse.json({ error: 'Satış kaydı bulunamadı.' }, { status: 404 });
    }

    // Role check: Manager can view any sale; Staff can view ONLY their own sale
    if (auth.user.role === 'personel' && sale.created_by_user_id !== auth.user.id) {
      return NextResponse.json(
        { error: 'Yalnızca kendi oluşturduğunuz satışların ayrıntılarını görüntüleyebilirsiniz.' },
        { status: 403 }
      );
    }

    const dayStatus = (sale.kasa_days as any)?.status || 'closed';
    const categoryObj: any = Array.isArray(sale.category) ? sale.category[0] : sale.category;
    const categoryName = categoryObj?.name || '';

    return NextResponse.json({
      id: sale.id,
      kasa_day_id: sale.kasa_day_id,
      category_id: sale.category_id,
      category_name: categoryName,
      product_name: sale.product_name,
      quantity: sale.quantity,
      unit_price_kurus: sale.unit_price_kurus,
      unit_cost_kurus: sale.cost_price_kurus || 0,
      total_price_kurus: sale.total_price_kurus,
      service_cost_kurus: sale.service_cost_kurus || 0,
      service_cost_payment_status: sale.service_cost_payment_status || 'previously_paid_or_stock',
      cash_paid_kurus: sale.cash_paid_kurus || 0,
      card_paid_kurus: sale.card_paid_kurus || 0,
      bank_transfer_paid_kurus: sale.bank_transfer_paid_kurus || 0,
      bank_transfer_reference: sale.bank_transfer_reference || '',
      credit_paid_kurus: sale.credit_paid_kurus || 0,
      credit_customer_id: sale.credit_customer_id || null,
      usd_amount_cents: sale.usd_paid_cents || 0,
      usd_rate_kurus: sale.usd_rate ? Math.round(Number(sale.usd_rate) * 100) : 0,
      usd_tl_equivalent_kurus: sale.usd_tl_equivalent_kurus || 0,
      eur_amount_cents: sale.eur_paid_cents || 0,
      eur_rate_kurus: sale.eur_rate ? Math.round(Number(sale.eur_rate) * 100) : 0,
      eur_tl_equivalent_kurus: sale.eur_tl_equivalent_kurus || 0,
      customer_name: sale.customer_name || '',
      customer_phone: sale.customer_phone || '',
      serial_imei: sale.serial_imei || '',
      notes: sale.description || '',
      status: sale.status,
      created_by_user_id: sale.created_by_user_id,
      day_status: dayStatus,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Satış detayları okunamadı.' }, { status: 500 });
  }
}
