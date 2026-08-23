/**
 * HurCELL Kasa Sistemi Yüksek Hassasiyetli Finansal Matematik Modülü
 * JavaScript Floating Point (Kayan Nokta) Hassasiyet Sapmalarını Engellemek İçin
 * BigInt ve Sabit Ölçekli Integer (Fixed-Point) Aritmetiği Kullanır.
 */

// Kur Hassasiyet Ölçeği (4 Ondalık Basamak: 1.0000 = 10000)
export const RATE_SCALE = BigInt(10000);

/**
 * String veya Number formatındaki kuru 4 ondalık basamaklı BigInt Scale'e Dönüştürür.
 * Örn: "40.1234" -> 401234n
 */
export function parseRateToScaledBigInt(rate: number | string): bigint {
  const numRate = typeof rate === 'string' ? parseFloat(rate) : rate;
  if (isNaN(numRate) || numRate <= 0) {
    throw new Error('GEÇERSİZ_KUR: Kur 0 veya negatif olamaz.');
  }

  const strRate = numRate.toFixed(4);
  const parts = strRate.split('.');
  const integerPart = BigInt(parts[0]);
  const decimalPart = BigInt(parts[1] || '0');

  return integerPart * RATE_SCALE + decimalPart;
}

/**
 * Döviz Cent Tutarını ve Kur Değerini kullanarak TL Kuruş Tutarını BigInt
 * Tam Sayı Bölme ve Deterministik Yuvarlama (Half-Up Integer Division) İle Hesaplar.
 */
export function calculateTLEquivalentKurus(foreignCents: number, rate: number | string): number {
  if (foreignCents < 0) {
    throw new Error('GEÇERSİZ_TUTAR: Döviz miktarı negatif olamaz.');
  }
  if (foreignCents === 0) return 0;

  const centsBig = BigInt(Math.round(foreignCents));
  const scaledRateBig = parseRateToScaledBigInt(rate);

  const resultKurusBig = (centsBig * scaledRateBig + RATE_SCALE / BigInt(2)) / RATE_SCALE;

  if (resultKurusBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('TAŞMA_HATASI: Hesaplanan kuruş değeri Number.MAX_SAFE_INTEGER sınırını aştı.');
  }

  return Number(resultKurusBig);
}

/**
 * Döviz Havuzu Durum Arayüzü (FX Cost Pool State)
 */
export interface FXCostPool {
  balance_cents: number;
  cost_pool_kurus: number;
}

export function addInflowToFXPool(
  pool: FXCostPool,
  inflowCents: number,
  tlEquivalentKurus: number
): FXCostPool {
  return {
    balance_cents: pool.balance_cents + Math.round(inflowCents),
    cost_pool_kurus: pool.cost_pool_kurus + Math.round(tlEquivalentKurus),
  };
}

export function getFXPoolWeightedAverageRate(pool: FXCostPool): number {
  if (pool.balance_cents <= 0 || pool.cost_pool_kurus <= 0) return 0;
  return Number((pool.cost_pool_kurus / pool.balance_cents).toFixed(4));
}

export function convertFromFXPool(
  pool: FXCostPool,
  convertedCents: number,
  actualRate: number | string
): {
  newPool: FXCostPool;
  tryReceivedKurus: number;
  costKurus: number;
  realizedDiffKurus: number;
} {
  const cents = Math.round(convertedCents);
  if (cents <= 0) {
    throw new Error('GEÇERSİZ_TUTAR: Bozdurulacak miktar 0 veya negatif olamaz.');
  }
  if (cents > pool.balance_cents) {
    throw new Error(`YETERSİZ_DÖVİZ: Kasada bozdurulacak yeterli bakiye yok. (Mevcut: ${pool.balance_cents / 100} FX, İstenen: ${cents / 100} FX)`);
  }

  const tryReceivedKurus = calculateTLEquivalentKurus(cents, actualRate);
  let costKurus = 0;
  let newPool: FXCostPool;

  if (cents === pool.balance_cents) {
    costKurus = pool.cost_pool_kurus;
    newPool = { balance_cents: 0, cost_pool_kurus: 0 };
  } else {
    const avgRate = getFXPoolWeightedAverageRate(pool);
    costKurus = calculateTLEquivalentKurus(cents, avgRate);
    newPool = {
      balance_cents: pool.balance_cents - cents,
      cost_pool_kurus: Math.max(pool.cost_pool_kurus - costKurus, 0),
    };
  }

  const realizedDiffKurus = tryReceivedKurus - costKurus;

  return { newPool, tryReceivedKurus, costKurus, realizedDiffKurus };
}

/**
 * Europe/Istanbul Saat Diliminde Takvim Günü Bazında Gecikme Hesabı
 * Varsayılan Eşik: 7 gün. Tam 7 takvim gününü aşan (8. takvim gününe giren) açık alacaklar gecikmiş sayılır.
 */
export function calculateOverdueDays(
  saleDateIsoStr: string,
  thresholdDays = 7,
  nowDateStr?: string
): {
  ageDays: number;
  isOverdue: boolean;
} {
  const saleDate = new Date(saleDateIsoStr);
  const targetDate = nowDateStr ? new Date(nowDateStr) : new Date();

  // Yalnızca tarih kısmını (YYYY-MM-DD) alarak saat dilimi farkını sıfırla
  const saleUtc = Date.UTC(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());
  const targetUtc = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  const diffMs = targetUtc - saleUtc;
  const ageDays = Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);

  return {
    ageDays,
    isOverdue: ageDays > thresholdDays,
  };
}

/**
 * İhtiyatlı Finansal Yönetim Göstergesi Hesabı
 *
 * Formül: Tahsil Edilmiş Gerçekleşen Kâr - Tahsil Edilmemiş Açık Cari Risk
 * Örn: Tahsil edilen kâr = 1.600 TL (160000 kuruş), Açık cari = 6.000 TL (600000 kuruş)
 * İhtiyatlı Sonuç = 160000 - 600000 = -440000 kuruş (-4.400 TL) (Kırmızı)
 */
export function calculatePrudentResult(
  realizedProfitKurus: number,
  openCreditRiskKurus: number
): number {
  return realizedProfitKurus - openCreditRiskKurus;
}

/**
 * YEREL DOĞRULAMA TEST SUITI
 */
export function runFXMathVerificationTests(): Array<{ testName: string; passed: boolean; output: string }> {
  const results: Array<{ testName: string; passed: boolean; output: string }> = [];

  // Test 1: 100,25 * 40,1234
  try {
    const k1 = calculateTLEquivalentKurus(10025, 40.1234);
    const pass1 = k1 === 402237;
    results.push({
      testName: 'Test 1: 100,25 USD * 40,1234 TL',
      passed: pass1,
      output: `Beklenen: 402237 kuruş (4.022,37 TL) | Çıktı: ${k1} kuruş`,
    });
  } catch (err: any) {
    results.push({ testName: 'Test 1', passed: false, output: err.message });
  }

  // Test Gecikme 1: 1 Ağustos vs 9 Ağustos (8 Gün > 7 Eşik)
  try {
    const ov = calculateOverdueDays('2026-08-01T10:00:00.000Z', 7, '2026-08-09T10:00:00.000Z');
    const passOv = ov.ageDays === 8 && ov.isOverdue === true;
    results.push({
      testName: 'Test Gecikme: 1 Ağustos -> 9 Ağustos (8 Gün)',
      passed: passOv,
      output: `Geçen Gün: ${ov.ageDays} | Gecikmiş mi?: ${ov.isOverdue} (Beklenen 8 gün, true)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Test Gecikme', passed: false, output: err.message });
  }

  // Test İhtiyatlı Sonuç: Kâr 1.600 TL, Açık Cari 6.000 TL -> -4.400 TL
  try {
    const prudent = calculatePrudentResult(160000, 600000);
    const passP = prudent === -440000;
    results.push({
      testName: 'Test İhtiyatlı Sonuç: Kâr 1.600 TL, Cari Risk 6.000 TL',
      passed: passP,
      output: `İhtiyatlı Sonuç: ${prudent / 100} TL (Beklenen -4.400 TL)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Test İhtiyatlı Sonuç', passed: false, output: err.message });
  }

  return results;
}
