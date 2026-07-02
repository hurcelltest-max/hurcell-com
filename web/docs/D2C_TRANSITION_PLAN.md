# HurCELL D2C Geçiş Planı

## Durum Raporu: B2B ana akıştan kaldırıldı/gizlendi
- Navbar üzerinden B2B (Bayi Girişi) ve Kayıt linkleri müşteri odaklı (D2C) görünümden çıkarıldı.
- Müşteriler artık mağaza içinde alışveriş yaparken sadece perakende araçlarını görecek.

## Durum Raporu: Sepet MVP eklendi
- `localStorage` ve React Context kullanılarak `CartProvider` eklendi.
- Sepet iconu ve aktif sepet sayısı Navbar'a entegre edildi.
- `/sepet` adresi altında sipariş özetini ve ürün yönetimini barındıran MVP Sepet sayfası oluşturuldu.
- Ürün detay sayfalarına "Sepete Ekle" butonu entegre edildi ve "Hemen Satın Al" butonu önce sepete atıp ardından yönlendirme yapacak şekilde revize edildi.
- Checkout sayfası modern sepet akışına uyumlu hale getirildi, ancak uyumluluk gereği eski `?product_id=X` akışı da muhafaza edildi.

## Aşama: Müşteri Kimliği ve SMS OTP (Planlanan)
- **Ana Kimlik:** D2C ana müşteri kimliği **telefon numarası** olacaktır.
- **Doğrulama:** E-posta/şifre üyeliği kullanılmayacak, ana doğrulama yöntemi SMS OTP olacaktır.
- **WhatsApp:** WhatsApp doğrulama ana yöntem olmayacak; ileride sadece sipariş bildirimleri vb. konularda opsiyonel bir iletişim kanalı olarak değerlendirilebilir.
- **Profil ve Adres:** Kullanıcının adres ve fatura bilgisi sadece ilk sipariş veya profil tamamlama aşamasında alınacaktır. Kayıtlı müşteriler sonraki siparişlerde adreslerini otomatik getirebilecektir.
- **Onaylar:** KVKK onayı ve ticari ileti (pazarlama) onayı ayrı ayrı saklanacaktır.

## Sonraki Aşamalar
- **SMS OTP Entegrasyonu:** SMS sağlayıcı API bilgileri temin edildikten sonra doğrulama modülü kurulacaktır. Şu anda sadece provider-agnostic altyapı hazırlanmıştır.
- **Müşteri/Adres Tabloları:** Supabase üzerinde yeni tablolar `sms_otp_codes`, `customers` ve `customer_addresses` oluşturulacaktır (Şu an taslak halindedir).
