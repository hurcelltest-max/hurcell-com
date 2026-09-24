# HurCELL Operasyon Merkezi — Paket O5 WhatsApp Sipariş & Onay Mimari Dokümanı

## 1. Müşteri Kimlik ve Telefon Normalizasyonu
- **Dış Format (External E.164):** `+905XXXXXXXXX` (Mesaj servislerinden veya kullanıcı girdisinden gelen orijinal telefon formatı).
- **Dahili Format (Internal Canonical):** `905XXXXXXXXX` (Veritabanında saklanan ve sorgulanan 12 haneli rakamsal dize).
- **Arama Sırası:**
  1. Gelen `+90` veya `05` numarası `905XXXXXXXXX` biçimine normalize edilir.
  2. `public.customers` tablosunda arama yapılır.
  3. Kayıtlı müşteri bulunursa `CUSTOMER_IDENTIFIED` state'ine geçilir.
  4. Müşteri bulunamazsa `CUSTOMER_REGISTRATION_REQUIRED` state'ine geçilir ve kayıt davet şablonu tetiklenir.

---

## 2. Kredi / Cari Karar Durumları (`credit_customers`)
- **bağlantı:** `credit_customers.customer_id -> customers.id` (Schema Diagnostic ile doğrulanacaktır).
- **Karar Durumları:**
  - `NO_CUSTOMER`: Müşteri kaydı yok.
  - `NO_CREDIT_ACCOUNT`: Müşteri var ancak cari kredili hesabı yok. Peşin ödeme seçeneği sunulur.
  - `CREDIT_ACCOUNT_BLOCKED`: Kredili hesap var ancak `is_active = false` veya `is_blocked = true`.
  - `ACTIVE_LIMIT_SUFFICIENT`: Aktif hesap ve kullanılabilir limit (`available_limit >= total_amount`).
  - `ACTIVE_LIMIT_INSUFFICIENT`: Aktif hesap fakat limit yetersiz (`available_limit < total_amount`).

---

## 3. Stok Rezervasyonu ve Satış Düşüm Kuralları
- **Onaya Kadar Stok Düşümü:** **YAPILMAZ** (Sıfır stok rezervasyon riski).
- **Onay Anı İşlemi:**
  1. Yönetici Operasyon Merkezi Onaylar sekmesinden "Onayla" butonuna basar.
  2. Ürün stok miktarı tekrar denetlenir.
  3. Stok yeterliyse `apply_stock_movement` RPC'si çağrılarak `movement_type = 'SALE'` kaydı işlenir ve stok düşürülür.
  4. Stok yetersizse onay başarısız olur ve müşteriye stok tükenme bildirimi gönderilir.

---

## 4. Güvenlik, Idempotency ve Fail-Closed Kuralları
- **Simulation Route Guards (`POST /api/admin/operations/whatsapp/simulate`):**
  - `process.env.NODE_ENV === 'production'` ve `WHATSAPP_SIMULATOR_ENABLED !== 'true'` durumunda **HTTP 404** yanıtı döner.
  - `Content-Type: application/json` zorunluluğu.
  - Gövde boyutu maksimum 2000 karakter ile sınırlandırılmıştır.
  - Senaryo ID allowlist kontrolü (`SCENARIO_1_REGISTERED_CREDIT_OK` .. `SCENARIO_6_IDEMPOTENT_REPLAY`).
- **Mükerrer İstek (Idempotency):** Aynı conversation ve mesaj tekrarında `idempotency_replayed = true` döner, mükerrer onay talebi oluşturulmaz.

---

## 5. Doğrulanması Beklenen Veritabanı Alanları
- `credit_customers.customer_id` `TBD — SCHEMA DIAGNOSTIC REQUIRED`
- `credit_customers.available_limit` `TBD — SCHEMA DIAGNOSTIC REQUIRED`
- `credit_customers.is_blocked` `TBD — SCHEMA DIAGNOSTIC REQUIRED`
