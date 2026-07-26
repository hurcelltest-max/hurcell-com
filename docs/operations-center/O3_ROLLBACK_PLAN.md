# O3 — Production Rollback & Safety Plan

**Document Version:** 1.0.0  
**Target Migration:** `supabase/migrations/20260726210000_operations_inventory_foundation.sql`  
**Target Environment:** HurCELL Production Supabase (`hurcell-com`, Ref: `ufazfmosiywlskjlzach`)

---

## 1. Important Safety Declaration

> [!CAUTION]
> **Körlemesine Destructive Rollback SQL Çalıştırılamaz!**  
> Veritabanı üzerinde `stock_movements` (Stok Defteri) veya `operation_approvals` (Onaylar) tablolarında gerçek operasyonel kayıtlar oluştuktan sonra bu tabloları `DROP TABLE` ile silmek kalıcı **denetim (audit) ve stok tarihçesi kaybına** yol açar.

---

## 2. Senaryo Analizleri ve Müdahale Adımları

### SENARYO A — Migration Transaction İçinde Hata Verdi (Execution Failure)
- **Durum:** `20260726210000_operations_inventory_foundation.sql` çalıştırılırken bir `FAIL-FAST` önkoşul hatası veya çakışma nedeniyle transaction iptal oldu (`ROLLBACK`).
- **Etki:** PostgreSQL transaction atomik yapısı gereği DDL adımlarının neredeyse tamamı veritabanına işlenmeden otomatik olarak geri alınır.
- **Müdahale Adımları:**
  1. Manuel `DROP` veya temizlik SQL'i çalıştırmayın.
  2. SQL Editor çıktı ekranındaki hata mesajını ve satır numarasını kopyalayın.
  3. `supabase/tests/operations_inventory_foundation_before_snapshot.sql` çalıştırarak veritabanı metadata durumunun korunduğunu teyit edin.
  4. Hata kök nedenini analiz edin; aynı SQL'i düzeltme yapmadan tekrar çalıştırmayın.

### SENARYO B — Migration Başarıyla Uygulandı Ancak Uygulama Katmanı Geri Alınacak (Post-Deploy Rollback)
- **Durum:** DDL ve RPC veritabanına başarıyla uygulandı; ancak uygulama katmanındaki Operasyon Merkezi modülünün geri çekilmesi gerekiyor.
- **Müdahale Adımları (Güvenli Dondurma - Safe Freeze):**
  1. **Operasyonel Yazmaları Dondurma:** `apply_stock_movement` RPC'sinin yürütme yetkisini dondurun:
     ```sql
     REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(UUID, TEXT, INT, TEXT, TEXT, TEXT, UUID, UUID, TEXT) FROM service_role;
     ```
  2. **Arayüz Erişimini Kaldırma:** Next.js admin navigasyonundaki (`/admin/operations`) Operasyon Merkezi menü bağlantısını pasife alın.
  3. **Veri Bütünlüğünü Koruma:** `stock_movements`, `operation_approvals` ve `products` üzerindeki yeni kolonları silmeyin (`DROP COLUMN / DROP TABLE yapmayın`). Veri geçmişi ve denetim kayıtları korunmalıdır.
  4. **Canlı Checkout Etkisi:** Mevcut web checkout sistemi (`decrement_product_stock_safe`) Paket O3 migration'ından tamamen bağımsız çalıştığı için canlı e-ticaret akışı bu durumdan etkilenmez.

---

## 3. Manuel Uygulama Sırası Rehberi (Execution Sequence)

1. **Adım 1:** `supabase/tests/operations_inventory_foundation_preflight.sql` dosyasını Supabase SQL Editor'da çalıştırın. Tüm `CRITICAL` ve `HIGH` seviyeli kontrollerin `PASS` olduğunu teyit edin.
2. **Adım 2:** `supabase/tests/operations_inventory_foundation_before_snapshot.sql` ile migration öncesi metadata görüntüsünü alın.
3. **Adım 3:** `supabase/migrations/20260726210000_operations_inventory_foundation.sql` dosyasını çalıştırın. (`Success. No rows returned` çıktısını doğrulayın).
4. **Adım 4:** `supabase/tests/operations_inventory_foundation_postflight.sql` çalıştırın ve 22 doğrulama kontrolünün tamamının `PASS` olduğunu teyit edin.
