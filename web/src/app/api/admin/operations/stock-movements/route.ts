import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_O4_MOVEMENT_TYPES = [
  'STOCK_IN',
  'SALE',
  'RETURN',
  'DAMAGE',
  'INTERNAL_USE',
  'PRINT_MATERIAL_USE',
] as const;

const APPROVAL_REQUIRED_TYPES = [
  'COUNT_INCREASE',
  'COUNT_DECREASE',
  'MANUAL_ADJUSTMENT',
] as const;

const ALLOWED_ORIGINS = new Set([
  'https://www.hurcell.com',
  'https://hurcell.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json',
};

// Best-Effort In-Memory Burst Rate Limiter with Bounded Eviction Cleanup
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();
const MAX_RATE_LIMIT_MAP_SIZE = 1000;

function cleanupRateLimitMap(now: number) {
  if (rateLimitMap.size > MAX_RATE_LIMIT_MAP_SIZE) {
    for (const [ip, record] of rateLimitMap.entries()) {
      if (now > record.expiresAt) {
        rateLimitMap.delete(ip);
      }
    }
    // Emergency cap if still exceeding
    if (rateLimitMap.size > MAX_RATE_LIMIT_MAP_SIZE) {
      rateLimitMap.clear();
    }
  }
}

function checkRateLimit(ip: string, maxRequests = 20, windowMs = 60000): boolean {
  const now = Date.now();
  cleanupRateLimitMap(now);

  const record = rateLimitMap.get(ip);

  if (!record || now > record.expiresAt) {
    rateLimitMap.set(ip, { count: 1, expiresAt: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count += 1;
  return true;
}

function validateSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (origin) {
    return ALLOWED_ORIGINS.has(origin.trim().toLowerCase());
  }

  // Fallback check on Referer header if Origin is omitted by browser
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      return ALLOWED_ORIGINS.has(refUrl.origin.toLowerCase());
    } catch {
      return false;
    }
  }

  // Fail closed for browser requests omitting both Origin and Referer
  return false;
}

function maskEmail(email: string | null): string {
  if (!email || !email.includes('@')) return 'operations-admin@system.local';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

interface StockMovementRow {
  id: string;
  product_id: string;
  movement_type: string;
  quantity_delta: number | string;
  stock_before: number | string;
  stock_after: number | string;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  actor_email?: string | null;
  created_at: string;
  products?: { name?: string | null } | null;
}

interface RpcResultRow {
  movement_id: string;
  product_id: string;
  stock_before: number | string;
  stock_after: number | string;
  quantity_delta: number | string;
  idempotent_replay: boolean;
}

// ============================================================================
// GET: READ STOCK MOVEMENTS HISTORY
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const productId = searchParams.get('product_id')?.trim();
    const movementType = searchParams.get('movement_type')?.trim();

    let query = supabase
      .from('stock_movements')
      .select(
        `id, product_id, movement_type, quantity_delta, stock_before, stock_after, reference_type, reference_id, notes, actor_email, created_at, products(name)`,
        { count: 'exact' }
      );

    if (productId) {
      if (!UUID_REGEX.test(productId)) {
        return NextResponse.json(
          { success: false, error: 'Geçersiz product_id biçimi.' },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      query = query.eq('product_id', productId);
    }

    if (movementType) {
      query = query.eq('movement_type', movementType.toUpperCase());
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('[STOCK_MOVEMENTS_GET_ERROR]', error.message);
      return NextResponse.json(
        { success: false, error: 'Stok hareketleri geçmişi alınırken bir hata oluştu.' },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    const rows = (data || []) as unknown as StockMovementRow[];
    const normalizedMovements = rows.map((row) => ({
      id: String(row.id),
      product_id: String(row.product_id),
      product_name: row.products?.name ? String(row.products.name) : 'Bilinmeyen Ürün',
      movement_type: String(row.movement_type),
      quantity_delta: typeof row.quantity_delta === 'number' ? row.quantity_delta : parseInt(String(row.quantity_delta || '0'), 10),
      stock_before: typeof row.stock_before === 'number' ? row.stock_before : parseInt(String(row.stock_before || '0'), 10),
      stock_after: typeof row.stock_after === 'number' ? row.stock_after : parseInt(String(row.stock_after || '0'), 10),
      reference_type: row.reference_type ? String(row.reference_type) : null,
      reference_id: row.reference_id ? String(row.reference_id) : null,
      notes: row.notes ? String(row.notes) : null,
      actor_email: maskEmail(row.actor_email || null),
      created_at: String(row.created_at),
    }));

    const total = count || 0;
    const total_pages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        success: true,
        data: normalizedMovements,
        pagination: {
          page,
          limit,
          total,
          total_pages,
        },
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[STOCK_MOVEMENTS_GET_UNCAUGHT]', errorMsg);
    return NextResponse.json(
      { success: false, error: 'Sunucu tarafında işlem gerçekleştirilemedi.' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

// ============================================================================
// POST: EXECUTE SECURE STOCK MOVEMENT VIA APPLY_STOCK_MOVEMENT RPC
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    // 1. Same-Origin / CSRF Enforcement
    if (!validateSameOrigin(req)) {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz alan adı isteği (Same-Origin kısıtlaması).' },
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }

    // 2. Content-Type Header Validation
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'İstek gövdesi application/json formatında olmalıdır.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // 3. Rate Limiting Check (Best-effort in-memory burst protection)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { success: false, error: 'Çok fazla stok hareketi isteği gönderildi. Lütfen bir dakika bekleyin.' },
        { status: 429, headers: NO_CACHE_HEADERS }
      );
    }

    // 4. Parse & Validate Request Body Payload Shape
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz veya nesne formatında olmayan JSON verisi.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const {
      product_id,
      movement_type,
      quantity_delta,
      reference_type,
      reference_id,
      idempotency_key,
      notes,
    } = body as Record<string, unknown>;

    // Validate Product ID (Exact UUID Format)
    if (!product_id || typeof product_id !== 'string' || !UUID_REGEX.test(product_id.trim())) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz veya eksik Ürün Kimliği (product_id).' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }
    const cleanProductId = product_id.trim();

    // Validate Movement Type
    const cleanType = String(movement_type || '').toUpperCase().trim();
    if ((APPROVAL_REQUIRED_TYPES as readonly string[]).includes(cleanType)) {
      return NextResponse.json(
        { success: false, error: `Stok hareket tipi '${cleanType}' onay akışı gerektirdiği için O4 aşamasında kısıtlanmıştır.` },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (!(ALLOWED_O4_MOVEMENT_TYPES as readonly string[]).includes(cleanType)) {
      return NextResponse.json(
        { success: false, error: 'Desteklenmeyen veya geçersiz stok hareket tipi.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Validate Quantity Delta
    const delta = typeof quantity_delta === 'number' ? Math.round(quantity_delta) : parseInt(String(quantity_delta || '0'), 10);
    if (isNaN(delta) || delta === 0) {
      return NextResponse.json(
        { success: false, error: 'Stok değişim miktarı (quantity_delta) sıfırdan farklı bir tam sayı olmalıdır.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Movement Sign Rules Enforcement
    if (['STOCK_IN', 'RETURN'].includes(cleanType) && delta < 0) {
      return NextResponse.json(
        { success: false, error: `${cleanType} hareket tipi için değişim miktarı pozitif (+) olmalıdır.` },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (['SALE', 'DAMAGE', 'INTERNAL_USE', 'PRINT_MATERIAL_USE'].includes(cleanType) && delta > 0) {
      return NextResponse.json(
        { success: false, error: `${cleanType} hareket tipi için değişim miktarı negatif (-) olmalıdır.` },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Validate Idempotency Key (Strict string format)
    const cleanIdempotencyKey = String(idempotency_key || '').trim();
    if (!cleanIdempotencyKey || cleanIdempotencyKey.length < 8 || cleanIdempotencyKey.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz veya eksik idempotency anahtarı.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Sanitize optional text fields
    const cleanReferenceType = String(reference_type || 'MANUAL_OPERATIONS').trim().slice(0, 50);
    const cleanReferenceId = reference_id ? String(reference_id).trim().slice(0, 100) : null;
    const cleanNotes = notes ? String(notes).trim().slice(0, 500) : null;

    // Server-side system actor assignment (Completely ignores client input)
    const systemActorEmail = 'operations-admin@system.local';

    // 5. Execute Server-Side getSupabaseAdmin RPC Call
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('apply_stock_movement', {
      p_product_id: cleanProductId,
      p_movement_type: cleanType,
      p_quantity_delta: delta,
      p_reference_type: cleanReferenceType,
      p_reference_id: cleanReferenceId,
      p_idempotency_key: cleanIdempotencyKey,
      p_actor_id: null,
      p_actor_email: systemActorEmail,
      p_notes: cleanNotes,
    });

    if (error) {
      console.error('[STOCK_MOVEMENT_RPC_ERROR]', error.code, error.message);

      if (error.message.includes('Insufficient stock')) {
        return NextResponse.json(
          { success: false, error: 'Yetersiz stok! Mevcut stok miktarı bu işlemi gerçekleştirmek için yetersizdir.' },
          { status: 409, headers: NO_CACHE_HEADERS }
        );
      }

      if (error.message.includes('Idempotency key payload conflict')) {
        return NextResponse.json(
          { success: false, error: 'Idempotency anahtarı farklı bir işlem verisiyle daha önce kullanıldı.' },
          { status: 409, headers: NO_CACHE_HEADERS }
        );
      }

      if (error.message.includes('Product not found')) {
        return NextResponse.json(
          { success: false, error: 'Belirtilen ürün veritabanında bulunamadı.' },
          { status: 404, headers: NO_CACHE_HEADERS }
        );
      }

      return NextResponse.json(
        { success: false, error: 'Stok hareketi işlenirken veritabanı hatası oluştu.' },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    // 6. Strict Structural RPC Output Validation
    if (!data || !Array.isArray(data) || data.length !== 1) {
      console.error('[STOCK_MOVEMENT_RPC_STRUCT_ERROR] Unexpected RPC output array length:', data?.length);
      return NextResponse.json(
        { success: false, error: 'Stok hareketi veritabanı yanıt yapısı geçersiz.' },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    const resultRow = (data as unknown as RpcResultRow[])[0];

    // Structural checks on RPC response properties
    const resMovementId = String(resultRow.movement_id || '');
    const resProductId = String(resultRow.product_id || '');
    const resStockBefore = typeof resultRow.stock_before === 'number' ? resultRow.stock_before : parseInt(String(resultRow.stock_before), 10);
    const resStockAfter = typeof resultRow.stock_after === 'number' ? resultRow.stock_after : parseInt(String(resultRow.stock_after), 10);
    const resQuantityDelta = typeof resultRow.quantity_delta === 'number' ? resultRow.quantity_delta : parseInt(String(resultRow.quantity_delta), 10);
    const resIdempotentReplay = Boolean(resultRow.idempotent_replay);

    if (
      !UUID_REGEX.test(resMovementId) ||
      resProductId.toLowerCase() !== cleanProductId.toLowerCase() ||
      isNaN(resStockBefore) ||
      isNaN(resStockAfter) ||
      resQuantityDelta !== delta
    ) {
      console.error('[STOCK_MOVEMENT_RPC_VAL_MISMATCH]', { resMovementId, resProductId, resQuantityDelta, delta });
      return NextResponse.json(
        { success: false, error: 'Stok hareketi yanıt verileri doğrulanamadı.' },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        movement_id: resMovementId,
        product_id: resProductId,
        stock_before: resStockBefore,
        stock_after: resStockAfter,
        quantity_delta: resQuantityDelta,
        idempotent_replay: resIdempotentReplay,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[STOCK_MOVEMENT_POST_UNCAUGHT]', errorMsg);
    return NextResponse.json(
      { success: false, error: 'Sunucu tarafında stok hareketi gerçekleştirilemedi.' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
