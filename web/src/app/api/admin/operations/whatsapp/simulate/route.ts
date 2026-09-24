import { NextRequest, NextResponse } from 'next/server';
import { simulateWhatsAppMessage } from '@/lib/whatsapp/simulator';
import { WhatsAppSimulationRequest } from '@/lib/whatsapp/types';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json',
};

const ALLOWED_SCENARIOS = new Set([
  'SCENARIO_1_REGISTERED_CREDIT_MANUAL_REVIEW',
  'SCENARIO_2_REGISTERED_CASH',
  'SCENARIO_3_UNREGISTERED',
  'SCENARIO_4_PENDING_REVIEW',
  'SCENARIO_5_OUT_OF_STOCK',
  'SCENARIO_6_IDEMPOTENT_REPLAY',
  'SCENARIO_7_UNLINKED_PHONE_MATCH',
  'SCENARIO_8_WA_ID_EXACT_MATCH',
]);

export async function POST(req: NextRequest) {
  // 1. Production Fail-Closed Guard (Default Disabled in Production)
  if (process.env.NODE_ENV === 'production' && process.env.WHATSAPP_SIMULATOR_ENABLED !== 'true') {
    return new NextResponse(null, { status: 404, headers: NO_CACHE_HEADERS });
  }

  // 2. Content-Type Header Guard
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { success: false, error: 'Geçersiz Content-Type. application/json gereklidir.' },
      { status: 415, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const rawText = await req.text();

    // 3. Body Length / Size Guard (Max 2000 chars)
    if (!rawText || rawText.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'İstek gövdesi boyutu sınırları aşıyor (Maksimum 2000 karakter).' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const body: WhatsAppSimulationRequest = JSON.parse(rawText);

    if (!body || !body.phone || typeof body.phone !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Lütfen simülasyon için geçerli bir telefon numarası girin.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // 4. Scenario Allowlist Guard
    if (body.scenario_fixture && !ALLOWED_SCENARIOS.has(body.scenario_fixture)) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz veya desteklenmeyen simülasyon senaryo ID.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // 5. Execute read-only simulation harness (Zero real DB write, zero outbound HTTP request)
    const simulationResult = simulateWhatsAppMessage(body);

    return NextResponse.json(
      {
        success: true,
        simulation: simulationResult,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Simülasyon sunucu hatası';
    console.error('[WHATSAPP_SIMULATION_ERROR]', errorMsg);
    return NextResponse.json(
      { success: false, error: 'WhatsApp simülasyonu gerçekleştirilemedi.' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
