# O1 — Route and Screen Map

**Document Version:** 1.0.0  
**Target URL Base:** `https://www.hurcell.com/admin/operations` (Alias: `https://operasyon.hurcell.com`)  
**Design Standard:** Dark/Light sleek modern dashboard layout with collapsable sidebar, desktop & mobile optimized.

---

## 1. Navigasyon ve Menü Yapısı

```text
[HurCELL Operasyon Merkezi]
 ├── 📊 Genel Bakış         (/admin/operations/dashboard)
 ├── 📦 Stok               (/admin/operations/stock)
 ├── 🛍️ Ürünler             (/admin/operations/products)
 ├── 👥 Müşteriler          (/admin/operations/customers)
 ├── 💬 SMS Merkezi         (/admin/operations/sms)
 ├── 🛡️ Onaylar            (/admin/operations/approvals)
 ├── 🖨️ Baskı İşleri        (/admin/operations/print-jobs)
 ├── 🌟 Sadakat             (/admin/operations/loyalty)
 ├── 🛒 Siparişler          (/admin/operations/orders)
 └── ⚙️ Ayarlar             (/admin/operations/settings)
```

---

## 2. Ekran Detayları ve Özellikleri

### 1. Genel Bakış (`/admin/operations/dashboard`)
- **KPI Kartları:** Toplam ürün, kritik stoktaki ürün sayısı, günlük sipariş sayısı, onay bekleyen işlemler, aktif SMS şablonları.
- **Kritik Stok Uyarısı:** Kritik stok seviyesinin altına düşen ürünlerin hızlı listesi.
- **Son Operasyon Hareketleri:** Son stok hareketleri ve onay bekleyen talepler.

### 2. Stok Modülü — Aksesuar Öncelikli (`/admin/operations/stock`)
- **Filtreler:** Kategori (Şarj kablosu, Adaptör, Kulaklık, Ekran koruyucu, Kılıf, Powerbank, Araç şarjı, Stand, Hafıza kartı, USB bellek, Pil, Diğer), Kritik Stok Filtresi, WhatsApp Satışına Açık, Web Satışına Açık.
- **Stok Hareketleri Alt Sekmesi:**
  - `STOK_GIRIS`, `SATIS`, `IADE`, `SAYIM_ARTI`, `SAYIM_EKSI`, `HASAR`, `KULLANIM`, `BASKI_MALZEME_KULLANIMI`, `MANUEL_DUZELTME` kayıt geçmişi.
  - Stok Miktarı Manuel Giriş / Excel İçe Aktar butonu.

### 3. Ürünler Modülü (`/admin/operations/products`)
- Ürün Ekleme / Düzenleme Formu:
  - Ürün Adı, SKU, Barkod, Kategori, Marka.
  - Alış Fiyatı, Satış Fiyatı.
  - Mevcut Stok, Kritik Stok Seviyesi.
  - Birim (Adet, Metre, Paket), Raf/Konum.
  - Durum (Aktif/Pasif).
  - WhatsApp Satışına Açık (`whatsapp_enabled`) & WhatsApp Görünür Adı / Açıklaması / Özel Fiyat Override.
  - Web Mağazasına Açık (`is_web_visible`).
  - Görsel URL / Yükleme, Açıklama.

### 4. Müşteriler (`/admin/operations/customers`)
- **Veri Kaynağı:** `public.customers` (Retail) ve `public.credit_customers` (Cari - ayrı sekme).
- Maskeli Telefon Gösterimi (`905*****1234`).
- Müşteri Statüsü Rozetleri: `ACTIVE`, `SUSPENDED`, `BLOCKED`.
- Müşteri Detay Kartı: Kayıt kaynağı (`WEB`, `STORE`, `WHATSAPP`), Toplam Sipariş, Toplam Harcama, Sadakat Puanı.

### 5. SMS Merkezi (`/admin/operations/sms`)
- **Şablon Yönetimi:** Sipariş Oluştu, Kargo Verildi, OTP, Kampanya Şablonları.
- **Gönderim Geçmişi:** `public.sms_notifications` tablosundan başarılı/başarısız loglar.
- **Gruplayarak SMS Taslağı Hazırlama:** Gönderim öncesi hedef alıcı sayısı hesaplama, toplu SMS için onay mekanizmasına gönderme.
- **Güvenlik:** OTP kodları veya tokenlar asla gösterilmez. SMS API anahtarları client'a sızdırılmaz.

### 6. Onaylar Modülü (`/admin/operations/approvals`)
- Toplu SMS Onayı, Stok Düzeltme Onayı, Fiyat Değişikliği Onayı, Ürün Yayın Onayı, İade Onayı, Baskı İşi Onayı, Müşteri Statü Değişikliği Onayı, Manuel Sadakat Puanı Onayı.
- Durumlar: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.
- Çift aşamalı kontrol (Talep eden / Onaylayan ayrımı).

### 7. Baskı İşleri (`/admin/operations/print-jobs`)
- Sipariş Oluşturma / Takip Kartı: Müşteri adı, maskeli telefon, baskı tipi (Dijital, Fotoğraf, Doküman), Renkli/Siyah-Beyaz, Sayfa Sayısı, Kopya Sayısı, Tek/Çift Taraf, Kağıt Tipi, Fiyat, Statü (`NEW` $\rightarrow$ `FILE_RECEIVED` $\rightarrow$ `REVIEWING` $\rightarrow$ `APPROVED` $\rightarrow$ `PRINTING` $\rightarrow$ `READY` $\rightarrow$ `DELIVERED`).

### 8. Sadakat Modülü (`/admin/operations/loyalty`)
- Puan Kural Yönetimi ve Müşteri Puan Defteri (`loyalty_ledger`).
- Puan Kazanma (`PURCHASE_EARN`, `SERVICE_EARN`, `PRINT_EARN`, `CAMPAIGN_BONUS`) ve Puan Kullanma (`REDEEM`) geçmişi.
- Manuel puan düzeltme talepleri doğrudan onaylar modülüne düşer.

### 9. Siparişler (`/admin/operations/orders`)
- Web ve mağaza siparişlerinin canlı takibi, müşteri profili bağlantısı (`customer_id`), kargo durumu.

### 10. Ayarlar (`/admin/operations/settings`)
- Operasyon rol ve yetki tanımları, mağaza çalışma parametreleri.
