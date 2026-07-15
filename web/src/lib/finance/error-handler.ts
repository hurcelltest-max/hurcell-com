import { NextResponse } from 'next/server';

export function handleFinanceApiError(error: unknown, fallbackMessage: string = 'İşlem gerçekleştirilemedi.') {
  if (!error) return null;

  const errObj = error as Record<string, unknown>;
  const code = String(errObj.code || '');
  const message = String(errObj.message || '');

  // 1. Check if database relation or function does not exist
  const isNotInitialized = 
    code === 'PGRST104' || 
    code === 'PGRST204' || 
    code === '42P01' || 
    message.includes('does not exist') || 
    message.includes('relation') || 
    message.includes('function');

  if (isNotInitialized) {
    const response = NextResponse.json(
      { error: 'Finance module is not initialized' },
      { status: 503 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // 2. Check if business logic exception raised via RAISE EXCEPTION
  if (code === 'P0001') {
    const response = NextResponse.json(
      { error: message },
      { status: 400 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // 3. Generic sanitized error response (no internal SQL/PostgREST details leaked)
  const response = NextResponse.json(
    { error: fallbackMessage },
    { status: 500 }
  );
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
