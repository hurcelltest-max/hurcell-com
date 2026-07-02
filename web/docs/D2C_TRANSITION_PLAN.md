# HurCELL D2C Geçiş Planı

## Durum Raporu: B2B ana akıştan kaldırıldı/gizlendi
- Navbar üzerinden B2B (Bayi Girişi) ve Kayıt linkleri müşteri odaklı (D2C) görünümden çıkarıldı.
- Müşteriler artık mağaza içinde alışveriş yaparken sadece perakende araçlarını görecek.

## Durum Raporu: Sepet MVP eklendi
- `localStorage` ve React Context kullanılarak `CartProvider` eklendi.
- Sepet iconu ve aktif sepet sayısı Navbar'a entegre edildi.
- `/sepet` adresi altında sipariş özetini ve ürün yönetimini barındıran MVP Sepet sayfası oluşturuldu.
- Ürün detay sayfalarına "Sepete Ekle" butonu entegre edildi ve "Hemen Satın Al" butonu önce sepete atıp ardından yönlendirme yapacak şekilde revize edildi.

## Sonraki Aşamalar
- **Checkout Sayfasının Sepet Entegrasyonu:** Mevcut `/checkout` yapısı tekil `product_id` query bazlı çalışıyor. Sepetten (LocalStorage/Context) veri çekecek şekilde çoklu ürüne uygun hale getirilecektir (Büyük değişiklik gerektirdiği için 1. aşamaya dahil edilmedi).
- **SMS OTP Entegrasyonu:** SMS sağlayıcı API bilgileri temin edildikten sonra doğrulama modülü kurulacaktır.
- **Müşteri/Adres Tabloları:** Supabase üzerinde yeni tablolar `sms_otp_codes`, `customers` ve `customer_addresses` oluşturulacaktır.
