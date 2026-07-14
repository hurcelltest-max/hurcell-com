# HurCELL Manuel Kargo Gönderim Çalışma Planı (Launch Runbook)

Bu kılavuz, kargo entegrasyonu tamamen otomatik hale gelene kadar HurCELL siparişlerinin elle yönetilmesi ve kargolanması adımlarını içerir.

## 1. Yeni Siparişlerin Tespiti
- Admin panelinde (`/admin/orders`) "Beklemede" (Pending) durumundaki siparişleri listeleyin.
- Her yeni sipariş otomatik olarak benzersiz bir `Sipariş Numarası` (ör. `HRC-YYYYMMDD-XXXXXX`) ile kaydedilir.

## 2. OTP Doğrulama Kontrolü
- Siparişlerin detay sayfasında OTP doğrulama tokenının olup olmadığı kontrol edilir.
- Müşterinin telefon doğrulaması (`/api/checkout/verify-otp`) yapılmadan sipariş kaydedilemediği için veritabanında yer alan siparişler "OTP Doğrulanmış" olarak kabul edilir.

## 3. Stok Rezervasyonu Kontrolü
- Sipariş oluşturulduğunda stoklar `decrement_product_stock_safe` RPC ile otomatik rezerve edilir.
- Admin panelinde sipariş kartında "Stok Ayrılma Tarihi" dolu olmalıdır. Eğer ürün stoğu yetersiz ise sipariş oluşturulamaz.

## 4. Müşteri Adresi Doğrulaması
- Kurye çıkışı yapılmadan önce müşteri adresi, ilçesi, ili ve telefon numarası formatı gözle kontrol edilir.
- Şüpheli veya eksik adresli siparişler için kargolama yapılmadan önce müşteri telefonla aranır.

## 5. DHL/MNG Paneli Üzerinden Manuel Gönderi Oluşturma
- [DHL MNG Kargo Müşteri Paneli](https://musteri.mngkargo.com.tr) adresine giriş yapın.
- "Gönderi Ekle / Kapıda Ödeme Gönderisi" adımını seçin.
- Müşteri Adı, Telefonu, Adresi bilgilerini girin.
- Sipariş tutarını "Nakit Kapıda Ödeme" (COD) olarak belirtin ve kargo bedelini (999 TL altı için 125 TL, üstü için ücretsiz) faturalandırın.

## 6. Barkod / Takip Numarasının Girişi
- Kargo paneli tarafından üretilen takip numarasını (Tracking Number) kopyalayın.
- HurCELL Admin Panelinde (`/admin/orders`) ilgili siparişi açarak "Kargo Takip Numarası" alanına girin ve kaydedin.

## 7. Sipariş Durumunun Güncellenmesi
- Takip numarası girilen siparişin durumunu admin panelinden `shipped` (Kargoya Verildi) olarak güncelleyin.
- Durum `shipped` yapıldığı an sipariş kilitlenir.

## 8. Teslimat / İptal Halinde Stok Davranışı
- Sipariş **İptal Edilirse (`cancelled`)** stoklar veritabanında `release_order_stock` RPC ile otomatik olarak iade edilir.
- Sipariş **Teslim Edilirse (`delivered`)** stok iade edilemez, bakiye kapatılır.
- Kargo teslim edilemeyip geri dönerse (`delivery_failed`), `release_order_stock` otomatik tetiklenip stokları envantere geri kazandırır.

## 9. Müşteri SMS Bilgilendirmesi
- Sipariş oluşturulduğunda (`order_created` SMS) müşteriye otomatik SMS gider.
- Durum `shipped` yapıldığında (`order_shipped` SMS) müşteriye kargo takip linkiyle beraber otomatik SMS gider.

## 10. Hatalı / Şüpheli Sipariş Prosedürü
- Adresinde geçersiz karakterler bulunan, sahte telefon numaraları içeren siparişler durumdan `cancelled` konumuna çekilerek iptal edilir.
- İptal edilen siparişlerin stokları envantere anında iade olur.

## 11. Çift Kargo Çıkışını Önleme Kontrolü
- DHL/MNG panelinde manuel işlem yaparken alıcı adı ve sipariş numarası kontrol edilmeli, aynı sipariş numarasıyla mükerrer kayıt oluşturulmamalıdır.
- Kargo takip numarası girilmiş olan bir sipariş için ikinci kez kargo paketi oluşturulması yasaktır.

## 12. Gün Sonu Mutabakat Kontrol Listesi
- Her akşam saat 18:00'de:
  1. HurCELL panelindeki `shipped` sipariş listesi ile DHL/MNG panelindeki aktif gönderi listesi karşılaştırılır.
  2. Takip numarası girilmemiş veya eksik `shipped` sipariş kalmadığı doğrulanır.
  3. İptal edilen siparişlerin stoklarının doğru şekilde ürün envanterine yansıdığı kontrol edilir.
