import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/require-admin-api';
import { financeAdminClient } from '@/lib/finance/server-client';
import { z } from 'zod';
import { handleFinanceApiError } from '@/lib/finance/error-handler';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const cancelPlanSchema = z.object({
  reason: z.string().min(1, 'İptal gerekçesi boş olamaz.'),
});

export async function POST(req: Request, context: RouteContext) {
  try {
    const auth = requireAdminApi(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await context.params;
    const body = await req.json();
    const parseResult = cancelPlanSchema.safeParse(body);
    
    if (!parseResult.success) {
      const response = NextResponse.json({ error: 'Geçersiz parametreler.', details: parseResult.error.issues[0]?.message }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const { reason } = parseResult.data;

    // Call cancel_finance_plan RPC
    const rpcArgs = {
      p_plan_id: id,
      p_admin_username: auth.username,
      p_reason: reason,
    };
    const { data, error } = await financeAdminClient.rpc('cancel_finance_plan', rpcArgs);

    if (error) {
      console.error('[FINANCE PLAN CANCEL RPC ERROR]', error);
      return handleFinanceApiError(error, 'Plan iptal edilemedi.');
    }

    const response = NextResponse.json({ success: true, result: data });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[FINANCE PLAN CANCEL EXCEPTION]', message);
    const response = NextResponse.json({ error: 'Beklenmeyen bir sistem hatası oluştu.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
