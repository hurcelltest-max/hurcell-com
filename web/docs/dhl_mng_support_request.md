# MNG / DHL Kargo API Entegrasyon Destek Talebi

Merhaba MNG Kargo / DHL Destek Ekibi,

HurCELL E-Ticaret altyapımızda "Barcode Command API" entegrasyonu geliştiriyoruz. Elimizdeki mevcut Swagger/OpenAPI (Barcode Command API 1.0) ZIP dökümanında `createbarcode`, `updateshipment` ve `cancelshipment` endpoint'lerini görüyoruz. Ancak bu servislerin zorunlu kıldığı `Bearer {token}` bilgisinin nasıl alınacağına dair resmi bir authentication (login) dokümantasyonu ZIP içerisinde bulunmamaktadır.

Sistemi canlı ortama almadan önce eksiksiz bir entegrasyon sağlamak adına aşağıdaki teknik detayları tarafımızla paylaşmanızı rica ederiz:

## 1. Authentication / Token Endpoint Bilgileri
- **Resmi Token Dokümanı:** Barcode Command API için Token/Auth dökümanı veya güncel Swagger dosyanız mevcut mudur?
- **Test Endpointi:** Bearer token alınacak kesin test URL'si nedir? (Örn: `https://testapi.mngkargo.com.tr/mngapi/api/token` ?)
- **Production Endpointi:** Bearer token alınacak kesin canlı URL'si nedir?
- **HTTP Method & Body:** Token isteği `POST` mu yoksa `GET` mi atılmalıdır? Body formatı `application/json` mıdır yoksa `x-www-form-urlencoded` mıdır?
- **Örnek İstek (Request):** Headers, URL ve JSON body'yi içeren örnek bir Token isteği (ve örnek bir başarılı Response).

## 2. API Headers ve Kimlik Bilgileri (Credentials)
- **CreateBarcode Headers:** İstek esnasında zorunlu olan tüm header'ları doğrulayabilir misiniz? 
  - `X-IBM-Client-Id`
  - `X-IBM-Client-Secret`
  - `Authorization: Bearer {token}`
  - `Content-Type`
  - `x-api-version` (Gerekiyorsa alması gereken değer nedir?)
- **Client ID & Client Secret (Test):** Test ortamı için kullanabileceğimiz Client ID ve Client Secret bilgilerini iletebilir misiniz?
- **Client ID & Client Secret (Production):** Canlı (Prod) ortamı için bu anahtarları alma/üretme sürecimiz nasıl işleyecektir? Portal üzerinden biz mi oluşturacağız?
- **Customer Code (Müşteri Kodu):** İsteklerde müşteri kodu göndermek zorunlu mudur?

## 3. Ağ (Network) ve Statik IP Kuralları
- **IP Whitelist Zorunluluğu:** API servisleriniz (Test veya Prod) IP whitelist (güvenilir IP tanımlaması) zorunluluğu gerektiriyor mu?
- **Dinamik IP Kullanımı:** Sunucularımız Vercel/Serverless altyapısında barındırılmaktadır ve dinamik/değişken IP adreslerine sahiptir. Dinamik IP adresli sunuculardan API çağrısı yapılabilir mi? 
- **Sabit IP (Proxy):** Eğer statik IP kesinlikle zorunluysa, bu durumda bir proxy servisi (örn: QuotaGuard) üzerinden sabit IP ile çıkış yapacağız. Whitelist için hangi adımları izlemeliyiz?

## 4. Kargo ve Sipariş Mantığı
- **Test Payload:** Test ortamında örnek bir barkod oluşturmak için başarılı bir JSON payload (örnek sipariş içeriği) gönderebilir misiniz?
- **Kapıda Ödeme (COD):** Kapıda ödeme siparişlerimiz için sadece `isCOD: 1` ve `codAmount: {tutar}` parametrelerini göndermek yeterli midir? 
- **Sandbox İşleyişi:** Test (Sandbox) ortamında yapılan istekler sisteminizde gerçek bir kargo faturası ve kurye talebi oluşturur mu, yoksa tamamen simülasyon amaçlı sanal (test) barkodları mı üretilir?

---

### Bizim Şu Anki Durumumuz
- Barcode Command Swagger elimizde incelenmiş durumdadır.
- `createbarcode`, `updateshipment` ve `cancelshipment` entegrasyon altyapımız (endpointlerimiz) kodlanmış ve hazırdır.
- Auth/token endpoint'i resmi belgede kesinleşmediği için gerçek API çağrısı henüz aktif edilmemiştir.
- Sistemimiz şu an tamamen **dry-run / payload preview (önizleme)** modunda bekletilmektedir.
- Tarafınızdan resmi token bilgisi ve Client anahtarları geldiğinde, entegrasyonu gerçek API çağrılarına açarak test gönderimi yapacağız.

---

### (GÜNCELLEME) Cevap Alındı / Yeni Bilgiler
Vendor'dan (DHL/MNG) yeni dokümanlar ve Postman Collection iletilmiştir. 
- **Token Endpointi Kesinleşti:** Token alınacak adres `POST /mngapi/api/token` olarak doğrulanmıştır. 
- **3 Aşamalı Akış:** Barkod alımından önce mutlaka `createRecipient` ve `CreateOrder` servislerinin çağrılması gerektiği kesinleşmiştir.
- **Statik IP Zorunluluğu:** Prod ortamında Statik IP kullanımı zorunlu kılınmıştır.
- **Eksik Bilgi:** `createRecipient` servisinin detayları Rest API PDF belgesinde çok kısıtlıdır, gerekli durumlarda destek ekibinden ek belge veya JSON şeması talep edilebilir.

Destekleriniz için teşekkür ederiz.
