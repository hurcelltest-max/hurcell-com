# D2C Customer SMS OTP Entegrasyon Planı

HurCELL B2C/D2C müşteri deneyimi için şifresiz, sadece telefon numarası ile çalışan hızlı üyelik ve giriş sistemi mimarisi.

## Müşteri Kimliği ve Oturum
- **Ana Kimlik:** Kullanıcının telefon numarası benzersiz (unique) kimliği olacaktır.
- **Şifre:** Klasik e-posta ve şifre ile giriş sistemi olmayacaktır.
- **Doğrulama:** Telefon numarasına gönderilen tek kullanımlık SMS OTP kodu ile oturum açılacaktır.
- **Kayıt ve Giriş Akışı (Seamless):** Giriş ve Kayıt (Login / Register) ayrımı yapılmayacaktır. Girilen numara sistemde yoksa otomatik oluşturulacak, varsa mevcut hesaba giriş yapılacaktır.

## SMS OTP Teknik Kuralları
- **Kod Tipi:** 6 haneli numerik kod.
- **Güvenlik (Hash):** OTP kodları veritabanında açık metin (plaintext) olarak saklanmayacak, **hashlenerek** (örn: SHA-256) tutulacaktır.
- **Geçerlilik Süresi (TTL):** Her kod oluşturulduktan sonra 300 saniye (5 dakika) boyunca geçerli olacaktır.
- **Deneme Sınırı (Brute-Force Koruması):** Bir OTP kodu için en fazla 5 yanlış girme hakkı tanınacak. Bu sınır aşılırsa kod geçersiz (consumed/expired) sayılacaktır.
- **Tekrar Gönderme (Cooldown):** Aynı numaraya üst üste SMS atılmasını önlemek için 60 saniyelik bir bekleme (cooldown) süresi uygulanacaktır.
- **IP Rate Limit:** Kötü niyetli istekleri engellemek için aynı IP adresinden belirli bir süre içinde en fazla N adet SMS talebi yapılabilecektir.

## Dry-Run ve SMS Sağlayıcı Mimarisi
- **SMS_ENABLE_REAL_SEND:** `.env.local` üzerinde bulunacak bu değişken `false` olduğu sürece sistem gerçek SMS atmayacak, kodu sadece log veya console üzerinden geliştiriciye gösterecektir.
- **Provider-Agnostic Yapı:** İleride SMS sağlayıcı (örneğin Netgsm, İletişim Makinesi, vb.) belli olduğunda kodun kolayca entegre edilebilmesi için bir `SmsProvider` interface/adapter yapısı kullanılacaktır.

## İzinler (Onaylar)
- **KVKK Onayı:** Müşterinin kişisel verilerinin işlenmesi için alınacak zorunlu onaydır (`kvkk_consent_at`).
- **Pazarlama Onayı:** Ticari elektronik ileti (SMS/E-posta kampanyaları vb.) almayı kabul etme durumudur (`marketing_consent_at`). 
- Onaylar birbirinden tamamen ayrı mekanizmalarla loglanacaktır.

## Adres ve Sipariş Süreci
- Müşteri sadece OTP ile doğrulanarak sisteme girecektir.
- Sipariş aşamasında adres, fatura, ad-soyad detayları talep edilecek ve bu bilgiler `customer_addresses` tablosunda saklanacaktır.
- Sonraki siparişlerde müşteri eski adreslerini seçebilecek, böylece checkout süreci hızlanacaktır.
