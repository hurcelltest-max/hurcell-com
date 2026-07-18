# HurCELL Ledger + Finance Production Deployment Runbook

Status:
- **Preview Ledger + Finance rehearsal:** PASS
- **V16 independent audit:** pending
- **Production preflight:** NOT RUN
- **Production migrations:** NOT RUN

Bu doküman, HurCELL Ledger ve Finance MVP veritabanı değişikliklerinin canlı ortama (Production) güvenli bir şekilde uygulanması için adım adım takip edilecek resmi süreç kılavuzudur.

---

## ÖNEMLİ KURALLAR & GÜVENLİK SINIRLARI

> [!IMPORTANT]
> * **Ledger Postflight BAŞARISIZ ise Finance Migration ÇALIŞTIRILAMAZ:** Ledger değişiklikleri tam PASS almadan bir sonraki adıma geçilmez.
> * **Hata Durumunda Tekrar Çalıştırmayın:** Herhangi bir SQL hatası oluşursa, aynı migration scriptini ikinci kez çalıştırmayın.
> * **Yerinde Düzeltme Yapmayın:** Veritabanında canlı ortamda (production) manuel nesne silme, değiştirme veya tablo yapısıyla oynama kesinlikle yasaktır.
> * **Ayrı Uygulama Deploy'u:** Production uygulama deploy'u veritabanı migration'ı ile aynı kontrolsüz adımda yapılmaz. DB geçişi tamamen bittikten sonra bağımsız karar verilir.
> * **Merge Yasaktır:** Preview Branch (`vmzzoffhqxqcgaajdvmm`) hiçbir zaman production'a merge edilmez veya Merge Request oluşturulmaz. Prova branşı doğrulamalar tamamen bitene kadar korunur.
> * **Kayıt ve Zaman Damgaları:** Her adımın başlangıç/bitiş zamanı ve çıktıları (log, ekran görüntüsü vb.) kanıt (evidence) olarak arşivlenmelidir.
> * **Production Dry-Run Yapılmayacaktır:** Canlı ortamda (production) hiçbir koşul altında dry-run SQL dosyası (`finance_mvp_dry_run.sql`) çalıştırılmayacaktır. Canlı ortamda yalnızca preflight, permanent migration'lar ve postflight sorguları çalıştırılır.

---

## CANLI UYGULAMA SIRASI (EXECUTION SEQUENCE)

### Adım 1: Deploy ve Migration Freeze
* Tüm uygulama deploy işlemlerini dondurun (Freeze).
* Canlı ortama yazma trafiğini minimuma indirin / bakım moduna alın.

### Adım 2: Production Project Ref Görsel Teyidi
* Supabase Dashboard URL'sinde aktif project ref'in tam olarak aşağıdaki değer olduğunu doğrulayın:
  ```text
  ufazfmosiywlskjlzach
  ```
* Eğer aktif ortam belirsizse veya farklı bir ref görünüyorsa derhal durun!

### Adım 3: Exact Dosya SHA256 Teyidi
* Uygulanacak dosyaların yerel SHA256 özet değerlerini doğrulayın:
  * **Ledger Migration:** `2B513E75DBC0B6DD684A7B54A5E0C26D74E15E6F439F9DD060FCA4262FBC8F26`
  * **Ledger Postflight:** `4431081EBE8B64C29355025A72518C0ED85E1F6C3ECF74494DFC37383B24CE42`
  * **Finance Migration:** `96EDB6127EC38572A7B8AB9E857FBAA859CF706E85DD74AACD9DCBE3F0B4E449`
  * **Finance Postflight (V12):** `B78B486F99F04F77709D99A515B49BDB77F42991169041FECEDA1F97773E6737`

### Adım 4: Salt-Okunur Production Preflight
* `supabase/tests/actual_production_finance_readiness_preflight.sql` (V16 SHA256: `D4408BD5C50AF69D0AF1CD47D98AE8332A74D26BA145E1E5A477B28FDEF1D42E`) dosyasını `ufazfmosiywlskjlzach` üzerinde çalıştırın.
* **Eşikler:**
  * `blocking_lock_count` = 0 olmalı.
  * `long_running_transaction_count` = 0 olmalı (Uzun transaction zaman aşımı eşiği: **5 dakika**).

### Adım 5: Preflight `overall_ok = true` Kapısı
* Preflight sorgusu sonucunda tek satırlık çıktıda `overall_ok` alanı kesinlikle `true` olmalıdır. `false` veya `null` ise durun.

### Adım 6: Ledger Migration (Yalnız Bir Kez)
* `supabase/migrations/20260716120000_credit_ledger_finance_readiness.sql` dosyasını tek seferde, değiştirilmeden çalıştırın.

### Adım 7: Ledger Postflight (Exactly One Row, `overall_ok = true`)
* `supabase/tests/credit_ledger_finance_readiness_postflight.sql` dosyasını çalıştırın.
* Tam olarak 1 satır dönmeli ve bu satırdaki `overall_ok` değeri `true` olmalıdır.

### Adım 8: Finance Migration (Yalnız Bir Kez)
* `supabase/migrations/20260716130000_finance_installments_mvp.sql` dosyasını tek seferde, değiştirilmeden çalıştırın.

### Adım 9: Finance V12 Postflight (Exactly One Row, `overall_ok = true`)
* `supabase/tests/finance_mvp_postflight.sql` dosyasını çalıştırın.
* 1 satır dönmeli ve `overall_ok` değeri `true` olmalıdır.

### Adım 10: Değişiklik Sonrası Veri Kontrolü & Karşılaştırma
* Geçiş sonrasında verilerin doğruluğunu teyit etmek için ilgili sayım sorgularını çalıştırın:
  1. **Finance Tabloları:** `finance_plans`, `finance_installments`, `finance_collections`, `finance_audit_logs` tabloları uygulama henüz yayına alınmadığı için **tamamen boş (0 kayıt)** olmalıdır.
  2. **Cari/Ledger Tabloları:** `credit_customers`, `credit_accounts` ve `credit_transactions` tablolarındaki veri sayıları, geçiş öncesi preflight aşamasında ölçülen sayılarla **birebir aynı (eşleşen)** olmalıdır. Mevcut Cari/Ledger verilerinin silinmesi veya sıfırlanması kesinlikle beklenmez.
  3. **Limit Kontrolleri:** Geçiş öncesi ve sonrası `maximum_transaction_amount` ve `maximum_balance_after` değerleri karşılaştırılmalı ve birebir eşleştiği doğrulanmalıdır.

### Adım 11: Evidence ve Zaman Damgası Kaydı
* Tüm başarılı çalıştırma loglarını, ekran görüntülerini ve başlangıç/bitiş zaman damgalarını kaydedin.

### Adım 12: Production DB PASS Sonrasında Uygulama Deploy Kararı
* Veritabanı geçişleri eksiksiz ve hatasız tamamlandıktan sonra, uygulama deploy sürecini başlatmak için ayrı ve bağımsız bir karar verin.

---

## PRODUCTION EVIDENCE (READ-ONLY INSPECTION)

* **Read-only inspection start:** 2026-07-18T21:39:37+03:00
* **Read-only inspection finish:** 2026-07-18T21:43:44+03:00
* **Strict ledger fingerprint:** PASS / overall_ok=true
* **V15 production preflight:** PARTIAL — rpc signature argument-name formatting false negative
* **Baseline:**
  * `credit_customers_count` = 3
  * `credit_accounts_count` = 3
  * `credit_transactions_count` = 0
  * `maximum_transaction_amount` = 0
  * `maximum_balance_after` = 0
  * `blocking_lock_count` = 0
  * `long_running_transaction_count` = 0
* **Production migrations:** NOT RUN
