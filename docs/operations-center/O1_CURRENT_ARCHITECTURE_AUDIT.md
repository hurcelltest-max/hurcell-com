# O1 — Current Architecture Audit & Reuse Analysis

**Document Version:** 1.0.0  
**Target Application:** HurCELL Operasyon Merkezi  
**Production Infrastructure:** Supabase (`hurcell-com`, Ref: `ufazfmosiywlskjlzach`)  
**Deployment Platform:** Vercel (`https://www.hurcell.com` / `https://operasyon.hurcell.com`)

---

## 1. Executive Summary

HurCELL Operasyon Merkezi, HurCELL'in tüm perakende, stok, müşteri, SMS, baskı, sadakat ve WhatsApp operasyonlarını tek bir merkezi arayüzden yönetmek üzere tasarlanmıştır.

### Mimari Kararlar
- **İkinci ERP veya İkinci Supabase Projesi YOKTUR:** Mevcut Supabase production veritabanı tek **Single Source of Truth (SSOT)** olarak kullanılır.
- **İkinci Müşteri Veritabanı YOKTUR:** Retail müşteriler için `public.customers`, Cari / HurCELL Limit müşterileri için `public.credit_customers` izolasyonu korunur.
- **Düşük Bakım Maliyetli Uygulama Modeli:** Yeni operasyon merkezi, mevcut HurCELL Next.js uygulaması (`web/src/app/admin/operations`) altında korumalı bir modül olarak konumlandırılır. `https://operasyon.hurcell.com` adresi DNS CNAME pointer ile bu modüle yönlendirilir.

---

## 2. Existing Schema Audit & Reuse Mapping

| Modül / İhtiyaç | Mevcut Tablo / Yapı | Durum & Yeniden Kullanım Stratejisi |
| :--- | :--- | :--- |
| **Retail Müşteri Master** | `public.customers` | **REUSE (Aynen Kullanılır).** `id`, `phone_normalized`, `registration_source`, `status`, `first_name`, `last_name`, `full_name`, `email`, `last_seen_at`, `phone_verified_at`, `whatsapp_wa_id`. |
| **Cari / Limit Müşteri** | `public.credit_customers` | **REUSE (Aynen Kullanılır - İzole).** HurCELL Limit / Cari hesaplar `public.customers` ile birleştirilmeden kendi tablosunda kalır. |
| **Ürün Kataloğu & Stok** | `public.products` | **ENRICH (Genişletilir).** Mevcut `id`, `name`, `category`, `brand`, `stock`, `price`, `sku`, `image_url` alanları kullanılır. Aksesuar ve operasyon takibi için `min_stock_level`, `shelf_location`, `purchase_price`, `unit`, `whatsapp_enabled`, `whatsapp_price` alanları eklenir. |
| **Atomik Stok RPC'leri** | `decrement_product_stock_safe`, `increment_product_stock_safe` | **REUSE (Aynen Kullanılır).** Stok düşme ve iade stok rollback işlemleri mevcut row-lock RPC'leri üzerinden yürütülür. |
| **Stok Hareket Tarihçesi** | *(Yok - Yalnız `stock` integer var)* | **NEW SCHEMA (`public.stock_movements`).** Stok giriş, satış, iade, sayım farkı, hasar ve kullanım hareketlerini izleyen ledger tablosu eklenecektir. |
| **Sipariş & Detaylar** | `public.orders`, `public.order_items` | **REUSE (Aynen Kullanılır).** Web siparişleri ve perakende satışlar mevcut sipariş tablolarına `customer_id` bağı ile yazılır. |
| **SMS ve OTP Logları** | `public.sms_notifications`, `public.phone_verifications` | **REUSE (Aynen Kullanılır).** SMS gönderim geçmişi ve OTP metadata logları mevcut tablolardan read-only sorgulanır. PII sızdırmaz. |
| **Operasyonel Onaylar** | *(Yok)* | **NEW SCHEMA (`public.operation_approvals`).** Toplu SMS, stok düzeltme, fiyat değişimi, iade, baskı işi ve müşteri engelleme onayları için çift aşamalı (Maker-Checker) onay tablosu eklenecektir. |
| **Baskı İşleri Takibi** | *(Kısmi)* | **NEW SCHEMA (`public.print_jobs`).** Mağaza içi dijital/fotoğraf/doküman baskı siparişlerinin takibi için tablo eklenecektir. |
| **Sadakat Puan Sistemi** | *(Yok)* | **NEW SCHEMA (`public.loyalty_accounts`, `public.loyalty_ledger`).** Müşteri başına tek hesap ve hareket bazlı puan defteri eklenecektir. |

---

## 3. Security & Isolation Directives

1. **Service Role Authorization:** Tüm operasyonel DB işlemleri sunucu tarafında (`getSupabaseAdmin()`) `service_role` yetkisiyle yürütülür.
2. **PII Masking:** Telefon numaraları Operasyon ekranında yalnız `905*****1234` biçiminde maskeli gösterilir.
3. **No Direct Mutation on Balance / Points:** Sadakat puanı ve stok miktarları doğrudan `UPDATE` ile serbestçe ezilemez; mutlaka hareket tablosu (`stock_movements`, `loyalty_ledger`) kaydı üzerinden hesaplanır.
