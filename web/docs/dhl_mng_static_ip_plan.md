# DHL/MNG Statik IP Çözüm Planı

MNG Kargo / DHL eCommerce Production (Canlı) ortamında API servislerini kullanabilmek için güvenlik gereği "Statik IP (Whitelist)" zorunluluğu bulunmaktadır. Ancak HurCELL projesi Vercel (Serverless) altyapısında host edildiği için çıkış IP adresleri (outbound IP) değişkendir.

Bu sorunu aşmak için aşağıdaki çözüm yöntemlerinden biri tercih edilmelidir:

## 1. QuotaGuard Static (Önerilen Hızlı Çözüm)
Vercel entegrasyonlarında en çok kullanılan yöntemdir.
- **Maliyet:** Düşük/Orta (Kullanım kotasına göre).
- **Kurulum:** QuotaGuard servisi üzerinden statik bir proxy IP'si alınır. Next.js API rotalarından MNG'ye atılan `fetch` istekleri, `https-proxy-agent` paketi kullanılarak bu proxy üzerinden geçirilir.
- **Avantajı:** Kendi sunucunuzu yönetmenize gerek kalmaz, Vercel ile tam uyumludur.

## 2. Kendi VPS Proxy Sunucumuz (Orta Maliyet)
Ucuz bir VPS (DigitalOcean, Hetzner, AWS EC2) sunucusu kiralayıp Nginx veya Squid Proxy kurmak.
- **Kurulum:** VPS statik bir IP'ye sahiptir. Vercel'den gelen istekleri alır ve MNG Kargo'ya iletir. Sadece Vercel'den veya private token ile gelen isteklere izin verilecek şekilde güvenliğe alınır.
- **Avantajı:** Düşük sabit maliyet, yüksek kontrol.
- **Dezavantajı:** Sunucu güvenliği ve bakımı size aittir.

## 3. Ayrı Backend Servisi
Eğer ileride Node.js (Express vb.) veya Go tabanlı sabit IP'li başka bir arka uç (backend) sunucusu planınız varsa, kargo API işlemlerini tamamen o sunucuya taşımak.

## Action Plan (Production'a Geçmeden Önce)
1. Yukarıdaki yöntemlerden biri seçilecek.
2. Seçilen yönteme ait Statik IP adresi (veya adresleri) belirlenecek.
3. `entegrasyon@mngkargo.com.tr` adresine şu formatta yetki talebi iletilecek:
   > "Müşteri Numaramız: XXXX. Uygulama Adımız: HurCELL Prod. Statik çıkış IP adresimiz: [PROXY_IP_ADRESI]. Lütfen bu IP'yi whitelist'e ekleyiniz."
4. `DHL_MNG_STATIC_OUTBOUND_IP`, `DHL_MNG_USE_STATIC_PROXY` (true), ve `DHL_MNG_PROXY_URL` ortam değişkenleri Vercel paneline tanımlanacak.
5. Kod içerisindeki gerçek `fetch` çağrılarına `https-proxy-agent` eklenecektir.

## Sandbox (Test) vs Production
- **Sandbox Testleri:** Statik IP olmadan denenebilir. Test ortamı genellikle whitelist kısıtlamasına sahip değildir.
- **Production (Canlı):** Statik IP zorunlu kabul edilecektir.
- **Gerçek Çağrılar:** Production gerçek çağrılar QuotaGuard/VPS/proxy planı netleşmeden ve ortam hazır olmadan kesinlikle açılmayacaktır.
