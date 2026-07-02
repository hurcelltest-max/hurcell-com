# DHL/MNG Barcode API Entegrasyon Analizi ve Planı

Bu belge, istenilen DHL/MNG API (Barcode Command) entegrasyonu için mevcut durum analizini ve güncellenmiş 3 aşamalı (Token dahil 4 aşamalı) uygulama planını içerir. Henüz hiçbir gerçek API isteği/deploy yapılmamıştır (Sistem Dry-Run / Önizleme modundadır).

## Keşif Raporu (Güncel)

Yeni analiz edilen vendor dökümanlarına göre entegrasyon tek bir adımdan değil, aşağıdaki zincirleme işlemlerden oluşmaktadır:

1. **Token Alma (Auth):** `POST /mngapi/api/token` adresinden `x-ibm-client-id`, `x-ibm-client-secret` ve body içinde `customerNumber`, `password` kullanılarak 8 saat geçerli `JWT Token` alınır.
2. **CreateRecipient (Alıcı Ön Kaydı):** `POST /mngapi/api/pluscmdapi/createRecipient` adresine sadece alıcı bilgileri (ad, telefon, il, ilçe vb.) gönderilir. Bu, varış şubesinin tespiti içindir.
3. **CreateOrder (Sipariş Aktarımı):** `POST /mngapi/api/standardcmdapi/createOrder` adresine sipariş referansı, desi/kilo bilgisi, kapıda ödeme (`isCOD`, `codAmount`) değerleri ve alıcı bilgileri iletilir.
4. **CreateBarcode (Barkod/ZPL Alma):** `POST /mngapi/api/barcodecmdapi/createbarcode` adresine sipariş referansı tekrar gönderilerek asıl kargo barkodu (ZPL formatında veya string olarak) teslim alınır.

### Eksik / Kısmi Bilgiler
- `createRecipient` methodu Rest API detay dokümanlarında detaylı açıklanmamış olsa da, Postman collection içinde doğrulanmış ve Payload'u çıkarılmıştır.

## Uygulama Planı

### 1. Ortam (Env) Değişkenlerinin Standardizasyonu
- `DHL_MNG_TEST_MODE`
- `DHL_MNG_SANDBOX_BASE_URL` (https://testapi.mngkargo.com.tr)
- `DHL_MNG_PROD_BASE_URL` (https://api.mngkargo.com.tr)
- `DHL_MNG_TOKEN_TEST_URL`
- `DHL_MNG_TOKEN_PROD_URL`
- `DHL_MNG_CLIENT_ID`
- `DHL_MNG_CLIENT_SECRET`
- `DHL_MNG_CUSTOMER_NUMBER`
- `DHL_MNG_API_PASSWORD`
- `DHL_MNG_APP_NAME`
- `DHL_MNG_STATIC_OUTBOUND_IP`
- `DHL_MNG_USE_STATIC_PROXY`
- `DHL_MNG_PROXY_URL`

### 2. Veritabanı (Migration) Kontrolü
Supabase `orders` tablosuna 3 aşamalı süreci destekleyecek yeni alanlar eklenecektir (`dhl_recipient_created_at`, `dhl_order_created_at`, `dhl_barcode_created_at`, jsonb response kolonları vb.). Bu alanlar `dhl_mng_migration.sql` dosyasında taslak olarak mevcuttur (Production'a henüz uygulanmamıştır).

### 3. API Endpointlerinin Geliştirilmesi (Dry-Run Scaffold)
Gerçek API çağrısı yapmadan sadece Payload Preview oluşturacak şekilde taslak (scaffold) rotalar kodlanmıştır:
- `GET /api/dhl/test`: Env kontrolleri
- `POST /api/dhl/create-recipient`: Alıcı oluşturma preview
- `POST /api/dhl/create-order`: Sipariş oluşturma preview
- `POST /api/dhl/create-barcode`: Barkod oluşturma preview
- `POST /api/dhl/create-shipment-flow`: Tek butona tıklandığında yukarıdaki 3 adımı sırayla (Dry-run) çalıştırıp frontend'e preview döner.
- Diğer (İptal ve Takip) rotalar skeleton olarak eklenmiştir.

### 4. UI (Sipariş Paneli) Güncellemesi
`src/app/siparis/[orderNumber]/page.tsx` sayfasındaki "DHL Barkod Oluştur" butonu artık `create-shipment-flow` API'sine bağlanmış ve ekranda 3 aşamalı (Alıcı, Sipariş, Barkod) data paketlerini (Dry-Run modunda) göstermektedir.

## Riskler / Dikkat Edilecekler
> [!IMPORTANT]
> 1. **Statik IP Zorunluluğu:** MNG Kargo production ortamında sabit IP istemektedir. (Bknz: `dhl_mng_static_ip_plan.md`)
> 2. **Dry-Run Modu:** Sistem henüz gerçek HTTP fetch isteği atmamaktadır, sadece veri dönüşümü ve yetkilendirme haritası kodlanmıştır.
