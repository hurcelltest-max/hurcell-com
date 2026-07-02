# DHL/MNG Barcode API Entegrasyon Analizi ve Planı

Bu belge, istenilen DHL/MNG API (Barcode Command) entegrasyonu için mevcut durum analizini ve uygulama planını içerir. Henüz hiçbir kod değişikliği veya deploy yapılmamıştır.

## Keşif Raporu

### Bulunan Mevcut Dosyalar
- `src/app/api/dhl/test/route.ts`: Çevresel değişken (env) kontrollerini yapan güvenlik test endpoint'i.
- `src/app/api/checkout/create-order/route.ts`: Müşteri bilgilerini ayrıştırılmış şekilde (`shipping_address_line`, `shipping_city` vb.) veritabanına kaydeden endpoint.
- `src/app/checkout/page.tsx`: Müşteri bilgilerini toplayan ve `create-order`'a gönderen ödeme sayfası.
- `src/app/siparis/[orderNumber]/page.tsx`: Müşterilerin (ve potansiyel olarak yöneticilerin) siparişlerini gördüğü ana panel sayfası.

### Mevcut Env Değişkenleri
Şu an sistemde şu değişkenler kullanılıyor:
- `DHL_API_USERNAME`
- `DHL_API_PASSWORD`
- `DHL_API_BASE_URL`

### Barcode Command API'den Anlaşılanlar
- Test Base URL: `https://testapi.mngkargo.com.tr/mngapi/api/barcodecmdapi`
- Yetkilendirme (Auth): Headers içinde `X-IBM-Client-Id` ve `X-IBM-Client-Secret` ile birlikte `Authorization: Bearer {token}` zorunludur.
- Temel Metodlar: `POST /createbarcode`, `PUT /updateshipment`, `PUT /cancelshipment`.

### Eksik Olan Auth/Token Bilgisi
> [!WARNING]
> Barcode Command dokümantasyonunda `Bearer {token}` ibaresi geçmesine rağmen, bu **token'ın nasıl alınacağını (Auth Endpoint / Login payload) açıklayan bir döküman bulunmamaktadır**. 
> Önceki oturumlardan bildiğimiz kadarıyla token almak için `https://api.mngkargo.com.tr/mngapi/api/token` adresine `customerNumber`, `password` ve `identityType: 1` ile istek atılması gerekiyor ancak Client ID ve Client Secret hala eksiktir.

## Uygulama Planı

### 1. Ortam (Env) Değişkenlerinin Standardizasyonu
Eski değişkenler terk edilecek ve sadece Server-Side yapılandırmada kalacak şekilde şu değişkenlere geçilecek:
- `DHL_MNG_API_BASE_URL`
- `DHL_MNG_CLIENT_ID`
- `DHL_MNG_CLIENT_SECRET`
- `DHL_MNG_USERNAME` (Customer Code yerine kullanılabilir)
- `DHL_MNG_PASSWORD`
- `DHL_MNG_TOKEN_URL`
- `DHL_MNG_CUSTOMER_CODE`
- `DHL_MNG_TEST_MODE`

### 2. Veritabanı (Migration) Kontrolü
Supabase `orders` tablosunda halihazırda `dhl_shipment_id`, `dhl_label_url`, `dhl_error_message`, `dhl_created_at`, `dhl_status` gibi kolonlar mevcut. Barcode response'unu (jsonb) saklamak için `dhl_barcodes` gibi bir JSONB alan eklenebilir. Bu migration SQL dosyası olarak sunulacaktır.

### 3. API Endpointlerinin Geliştirilmesi
1. **`GET /api/dhl/test`**: Sadece yeni `DHL_MNG_*` env değişkenlerinin eksiksiz olup olmadığını kontrol edecek şekilde güncellenecek. Gizli veriler maskelenecek.
2. **`POST /api/dhl/create-shipment`**: 
   - `order_id` alacak.
   - DB'den siparişi okuyacak. Kapıda ödeme (`isCOD`, `codAmount`) ve ayrık adres mantığı map edilecek. Telefon no normalize edilecek.
   - Token url eksikse veya Auth alınamıyorsa Mock/Dry-Run (Test) modunda hata dönmeyecek ancak gerçek istek atmayacak.
3. **`PUT /api/dhl/update-shipment`** ve **`PUT /api/dhl/cancel-shipment`**: Taslak skeleton (boş API yapısı) olarak eklenecek.

### 4. UI (Sipariş Paneli) Güncellemesi
`src/app/siparis/[orderNumber]/page.tsx` sayfasına (veya admin paneli varsa oraya) "DHL Barkod Oluştur" butonu eklenecek. Tıklandığında `create-shipment` API'sine istek atacak, başarılı/başarısız durumlarını toast veya statik mesajla bildirecek.

## Riskler / Dikkat Edilecekler
> [!IMPORTANT]
> 1. **Statik IP Riski:** Vercel production sunucularının IP adresi dinamiktir. MNG Kargo production ortamında sabit (static whitelist) IP isteyebilir. Bu durum canlıya çıkışta Firewall (403) hatasına neden olabilir.
> 2. **Client ID / Secret Eksikliği:** Portal üzerinden alınacak olan kimlik bilgileri olmadan Token endpoint'ine gidilirse yetkilendirme hatası alınacaktır.

## User Review Required
Yukarıdaki plan dahilinde kodlama aşamasına (commitlere) başlamak için onayınızı bekliyorum. Onayınız sonrasında "Keşif/Dokümantasyon" commit'i ile başlayıp adım adım kodlama yapılacaktır.
