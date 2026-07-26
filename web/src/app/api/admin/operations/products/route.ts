import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface OperationsProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  stock: number;
  price: number;
  cost_price: number | null;
  min_stock_level: number | null;
  shelf_location: string | null;
  unit: string | null;
  is_active: boolean;
  is_web_visible: boolean;
  whatsapp_enabled: boolean;
  whatsapp_display_name: string | null;
  whatsapp_description: string | null;
  whatsapp_price: number | null;
  whatsapp_sort_order: number | null;
  image_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json',
};

// Explicit allowlist excluding 'barcode' (confirmed missing from production schema)
const PRODUCTS_ALLOWLIST_SELECT = `id, name, sku, category, brand, stock, price, cost_price, min_stock_level, shelf_location, unit, is_active, is_web_visible, whatsapp_enabled, whatsapp_display_name, whatsapp_description, whatsapp_price, whatsapp_sort_order, image_url, created_at`;

export async function GET(req: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    // Defense-in-depth pagination parameters validation
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);

    const rawLimit = parseInt(searchParams.get('limit') || '25', 10);
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 25 : rawLimit));
    const offset = (page - 1) * limit;

    // Search query sanitization & length bounding
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const category = (searchParams.get('category') || '').trim().slice(0, 100);
    const stockStatus = (searchParams.get('stock') || '').trim().slice(0, 50);
    const whatsappFilter = searchParams.get('whatsapp_enabled');
    const webVisibleFilter = searchParams.get('is_web_visible');
    const activeFilter = searchParams.get('is_active');

    // Explicit allowlist select query (NO select('*') overfetching)
    let query = supabase
      .from('products')
      .select(PRODUCTS_ALLOWLIST_SELECT, { count: 'exact' });

    // Apply search filter across name, sku with escaped ILIKE (excluding barcode)
    if (search) {
      const sanitizedSearch = search.replace(/[%_\\]/g, '\\$&');
      query = query.or(
        `name.ilike.%${sanitizedSearch}%,sku.ilike.%${sanitizedSearch}%`
      );
    }

    // Apply category filter only when non-empty and non-default
    if (category && category !== 'Tüm Kategoriler' && category !== 'Tüm Aksesuarlar') {
      query = query.eq('category', category);
    }

    // Apply stock status filter
    if (stockStatus === 'in_stock') {
      query = query.gt('stock', 0);
    } else if (stockStatus === 'out_of_stock') {
      query = query.lte('stock', 0);
    } else if (stockStatus === 'low_stock') {
      query = query.gt('stock', 0).lte('stock', 5);
    }

    // Strict boolean channel & visibility filters
    if (whatsappFilter === 'true') query = query.eq('whatsapp_enabled', true);
    if (whatsappFilter === 'false') query = query.eq('whatsapp_enabled', false);

    if (webVisibleFilter === 'true') query = query.eq('is_web_visible', true);
    if (webVisibleFilter === 'false') query = query.eq('is_web_visible', false);

    if (activeFilter === 'true') query = query.eq('is_active', true);
    if (activeFilter === 'false') query = query.eq('is_active', false);

    // Clean order & range
    query = query
      .order('created_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error(`[OPERATIONS_PRODUCTS_GET_ERROR] [request_id=${requestId}]`, error.message);
      return NextResponse.json(
        {
          success: false,
          error: 'Stok ürün listesi alınırken bir hata oluştu.',
          request_id: requestId,
        },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    const normalizedProducts: OperationsProduct[] = (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id || ''),
      name: String(row.name || ''),
      sku: row.sku ? String(row.sku) : null,
      barcode: null, // Set to null as barcode is confirmed missing from production schema
      category: row.category ? String(row.category) : null,
      brand: row.brand ? String(row.brand) : null,
      stock: typeof row.stock === 'number' ? row.stock : parseInt(String(row.stock || '0'), 10),
      price: typeof row.price === 'number' ? row.price : parseFloat(String(row.price || '0')),
      cost_price: row.cost_price !== null && row.cost_price !== undefined ? parseFloat(String(row.cost_price)) : null,
      min_stock_level: row.min_stock_level !== null && row.min_stock_level !== undefined ? parseInt(String(row.min_stock_level), 10) : null,
      shelf_location: row.shelf_location ? String(row.shelf_location) : null,
      unit: row.unit ? String(row.unit) : null,
      is_active: row.is_active !== undefined && row.is_active !== null ? Boolean(row.is_active) : true,
      is_web_visible: row.is_web_visible !== undefined && row.is_web_visible !== null ? Boolean(row.is_web_visible) : true,
      whatsapp_enabled: row.whatsapp_enabled !== undefined && row.whatsapp_enabled !== null ? Boolean(row.whatsapp_enabled) : false,
      whatsapp_display_name: row.whatsapp_display_name ? String(row.whatsapp_display_name) : null,
      whatsapp_description: row.whatsapp_description ? String(row.whatsapp_description) : null,
      whatsapp_price: row.whatsapp_price !== null && row.whatsapp_price !== undefined ? parseFloat(String(row.whatsapp_price)) : null,
      whatsapp_sort_order: row.whatsapp_sort_order !== null && row.whatsapp_sort_order !== undefined ? parseInt(String(row.whatsapp_sort_order), 10) : null,
      image_url: row.image_url ? String(row.image_url) : null,
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
    }));

    const total = count || 0;
    const total_pages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json(
      {
        success: true,
        data: normalizedProducts,
        pagination: {
          page,
          limit,
          total,
          total_pages,
        },
        request_id: requestId,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Bilinmeyen sunucu hatası';
    console.error(`[OPERATIONS_PRODUCTS_UNCAUGHT] [request_id=${requestId}]`, errorMsg);
    return NextResponse.json(
      {
        success: false,
        error: 'Sunucu tarafında işlem gerçekleştirilemedi.',
        request_id: requestId,
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
