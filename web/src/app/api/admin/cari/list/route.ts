import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawFilterStatus = searchParams.get('status');
    const validStatuses = ['pending_review', 'active', 'rejected', 'suspended', 'blacklisted'];
    const filterStatus = rawFilterStatus && validStatuses.includes(rawFilterStatus) ? rawFilterStatus : null;
    
    if (rawFilterStatus && !validStatuses.includes(rawFilterStatus)) {
      return NextResponse.json({ error: 'Geçersiz statü filtresi.' }, { status: 400 });
    }

    let page = parseInt(searchParams.get('page') || '1', 10);
    if (isNaN(page) || page < 1) page = 1;

    let limit = parseInt(searchParams.get('limit') || '50', 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;
    
    // Calculate offset
    const offset = (page - 1) * limit;

    let query = getSupabaseAdmin().from('credit_customers')
      .select(`
        id, 
        phone, 
        full_name, 
        customer_card_code, 
        card_token, 
        status, 
        created_at,
        credit_accounts (
          status,
          credit_limit,
          current_balance,
          statement_day
        )
      `, { count: 'exact' });

    if (filterStatus) {
      query = query.eq('status', filterStatus);
    }

    // Sort by created_at descending, putting pending ones first effectively if we filter
    query = query.order('created_at', { ascending: false });
    
    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[ADMIN CARI LIST] Supabase error:', error);
      return NextResponse.json({ error: 'Veritabanı hatası oluştu.' }, { status: 500 });
    }

    // Format response
    const formattedData = data.map((customer: any) => {
      const account = customer.credit_accounts && customer.credit_accounts.length > 0 
        ? customer.credit_accounts[0] 
        : null;
        
      return {
        customer_id: customer.id,
        card_token: customer.card_token,
        customer_card_code: customer.customer_card_code,
        full_name: customer.full_name,
        phone: customer.phone,
        cust_status: customer.status,
        acc_status: account?.status || null,
        limit: account?.credit_limit || 0,
        current_balance: account?.current_balance || 0,
        statement_day: account?.statement_day || null,
        created_at: customer.created_at
      };
    });

    return NextResponse.json({ 
      data: formattedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[ADMIN CARI LIST] Internal error:', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
