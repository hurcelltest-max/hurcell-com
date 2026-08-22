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

  // 4 ondalık basamak hassasiyetle BigInt'e çevir
  const strRate = numRate.toFixed(4);
  const parts = strRate.split('.');
  const integerPart = BigInt(parts[0]);
  const decimalPart = BigInt(parts[1] || '0');

  return integerPart * RATE_SCALE + decimalPart;
}

/**
 * Döviz Cent Tutarını ve Kur Değerini kullanarak TL Kuruş Tutarını BigInt
 * Tam Sayı Bölme ve Deterministik Yuvarlama (Half-Up Integer Division) İle Hesaplar.
 *
 * Formül: (foreign_cents * scaled_rate + 5000) / 10000
 * Örn: 10025 cents (100.25 USD) * 401234 (40.1234 TL)
 * = (10025 * 401234 + 5000) / 10000 = (4022370850 + 5000) / 10000
 * = 4022375850 / 10000 = 402237 kuruş (4.022,37 TL)
 */
export function calculateTLEquivalentKurus(foreignCents: number, rate: number | string): number {
  if (foreignCents < 0) {
    throw new Error('GEÇERSİZ_TUTAR: Döviz miktarı negatif olamaz.');
  }
  if (foreignCents === 0) return 0;

  const centsBig = BigInt(Math.round(foreignCents));
  const scaledRateBig = parseRateToScaledBigInt(rate);

  // BigInt tam sayı çarpımı ve deterministik yarım üst yuvarlama
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

/**
 * Döviz Girişinde Havuzu Günceller (Satış veya Döviz Sermayesi)
 */
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

/**
 * Havuzun Anlık Ağırlıklı Ortalama Maliyet Kuru (TL/Döviz)
 */
export function getFXPoolWeightedAverageRate(pool: FXCostPool): number {
  if (pool.balance_cents <= 0 || pool.cost_pool_kurus <= 0) return 0;
  // Kur = (Cost Pool Kuruş / Balance Cents)
  return Number((pool.cost_pool_kurus / pool.balance_cents).toFixed(4));
}

/**
 * Döviz Bozdurma Sırasında Havuzdan Düşme ve Gerçekleşen Kur Farkı Hesabı
 */
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

  // EĞER TAMAMEN BOZDURULUYORSA (FULL CONVERSION):
  if (cents === pool.balance_cents) {
    costKurus = pool.cost_pool_kurus; // Havuzun tüm kalan maliyeti düşer!
    newPool = {
      balance_cents: 0,
      cost_pool_kurus: 0, // Kuruş artığı kalması engellenir!
    };
  } else {
    // KISMİ BOZDURMA (PARTIAL CONVERSION):
    const avgRate = getFXPoolWeightedAverageRate(pool);
    costKurus = calculateTLEquivalentKurus(cents, avgRate);
    newPool = {
      balance_cents: pool.balance_cents - cents,
      cost_pool_kurus: Math.max(pool.cost_pool_kurus - costKurus, 0),
    };
  }

  const realizedDiffKurus = tryReceivedKurus - costKurus;

  return {
    newPool,
    tryReceivedKurus,
    costKurus,
    realizedDiffKurus,
  };
}

/**
 * BİRİMDEN BAĞIMSIZ TEST SUITI (Doğrudan Node/TS ortamında çalıştırılabilir)
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
      output: `Beklenen: 402237 kuruş (4.022,37 TL) | Çıktı: ${k1} kuruş (${(k1 / 100).toFixed(2)} TL)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Test 1', passed: false, output: err.message });
  }

  // Test 2: 1,00 * 40,1250
  try {
    const k2 = calculateTLEquivalentKurus(100, 40.125);
    const pass2 = k2 === 4013;
    results.push({
      testName: 'Test 2: 1,00 USD * 40,1250 TL',
      passed: pass2,
      output: `Beklenen: 4013 kuruş (40,13 TL) | Çıktı: ${k2} kuruş (${(k2 / 100).toFixed(2)} TL)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Test 2', passed: false, output: err.message });
  }

  // Test 3: 0,01 * 40,1234
  try {
    const k3 = calculateTLEquivalentKurus(1, 40.1234);
    const pass3 = k3 === 40;
    results.push({
      testName: 'Test 3: 0,01 USD * 40,1234 TL',
      passed: pass3,
      output: `Beklenen: 40 kuruş (0,40 TL) | Çıktı: ${k3} kuruş (${(k3 / 100).toFixed(2)} TL)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Test 3', passed: false, output: err.message });
  }

  // Test 4: 100,00 * 40,0000
  try {
    const k4 = calculateTLEquivalentKurus(10000, 40.0);
    const pass4 = k4 === 400000;
    results.push({
      testName: 'Test 4: 100,00 USD * 40,0000 TL',
      passed: pass4,
      output: `Beklenen: 400000 kuruş (4.000,00 TL) | Çıktı: ${k4} kuruş (${(k4 / 100).toFixed(2)} TL)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Test 4', passed: false, output: err.message });
  }

  // Test Senaryosu A: 100@40 + 100@42 -> 150@43 bozdurma
  try {
    let poolA: FXCostPool = { balance_cents: 0, cost_pool_kurus: 0 };
    poolA = addInflowToFXPool(poolA, 10000, 400000); // 100 USD @ 40
    poolA = addInflowToFXPool(poolA, 10000, 420000); // 100 USD @ 42

    const avgRateA = getFXPoolWeightedAverageRate(poolA);
    const convA = convertFromFXPool(poolA, 15000, 43.0); // 150 USD @ 43

    const passA =
      avgRateA === 41.0 &&
      convA.costKurus === 615000 &&
      convA.tryReceivedKurus === 645000 &&
      convA.realizedDiffKurus === 30000 &&
      convA.newPool.balance_cents === 5000 &&
      convA.newPool.cost_pool_kurus === 205000;

    results.push({
      testName: 'Senaryo A: 100@40 + 100@42 -> 150@43 bozdurma',
      passed: passA,
      output: `Ortalama Kur: ${avgRateA} TL (Beklenen 41.0) | Bozdurma Maliyeti: ${convA.costKurus / 100} TL (Beklenen 6150) | Elde Edilen: ${convA.tryReceivedKurus / 100} TL | Kur Farkı: ${convA.realizedDiffKurus / 100} TL (Beklenen 300) | Kalan Bakye: ${convA.newPool.balance_cents / 100} USD | Kalan Maliyet: ${convA.newPool.cost_pool_kurus / 100} TL (Beklenen 2050)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Senaryo A', passed: false, output: err.message });
  }

  // Test Senaryosu B: 100@40 -> 50 bozdurma -> 100@60 giriş
  try {
    let poolB: FXCostPool = { balance_cents: 0, cost_pool_kurus: 0 };
    poolB = addInflowToFXPool(poolB, 10000, 400000); // 100 USD @ 40
    const convB = convertFromFXPool(poolB, 5000, 40.0); // 50 USD bozdurma
    poolB = addInflowToFXPool(convB.newPool, 10000, 600000); // 100 USD @ 60

    const avgRateB = getFXPoolWeightedAverageRate(poolB);
    const passB =
      poolB.balance_cents === 15000 &&
      poolB.cost_pool_kurus === 800000 &&
      avgRateB === 53.3333;

    results.push({
      testName: 'Senaryo B: 100@40 -> 50 bozdurma -> 100@60 giriş',
      passed: passB,
      output: `Kalan Bakye: ${poolB.balance_cents / 100} USD (Beklenen 150) | Kalan Maliyet Pool: ${poolB.cost_pool_kurus / 100} TL (Beklenen 8000) | Yeni Ortalama Kur: ${avgRateB} TL (Beklenen 53.3333)`,
    });
  } catch (err: any) {
    results.push({ testName: 'Senaryo B', passed: false, output: err.message });
  }

  return results;
}
