# HurCELL Operasyon Merkezi — Paket O7 Döner Kredi Limiti ve Borç Ledger İş Kuralları (Business Rules)

> [!IMPORTANT]
> HurCELL Kredisi **Döner (Revolving) Kredi / Yenilenen Limit** modeliyle çalışır. Kredili alışveriş kullanılabilir limiti düşürür; onaylanmış ödeme ve iadeler kullanılabilir limiti anında geri açar.

---

## 1. Limit Kuralları (Credit Limit Rules)
- `credit_limit` yönetici tarafından tanımlanır ve negatif olamaz.
- Limit değişiklikleri `public.credit_account_limit_changes` audit tablosunda yönetici kimliği ve gerekçesiyle saklanır.
- **Açık Borç Sınırı:** Limit azaltma işleminde yeni limit tutarı mevcut açık borcun (`outstanding_principal`) altına indirilemez.
  - *TBD — BUSINESS RULE:* Müşteri limiti açık borcun altına zorunlu indirilecekse `is_blocked = true` yapılarak yeni kredi kullanımı kilitlenmelidir.

---

## 2. Açık Borç ve Kullanılabilir Limit Hesaplama Formulasyonu

### **Formül:**
$$\text{available\_limit} = \text{credit\_limit} - \text{outstanding\_principal} - \text{pending\_authorizations}$$

- **`outstanding_principal` (Açık Anapara Borcu):**
  $$\text{outstanding\_principal} = \sum \text{principal\_effect} \quad (\text{status} = \text{'CONFIRMED'})$$
- **`pending_authorizations` (Bekleyen Kredi Onayları):**
  $$\text{pending\_authorizations} = \sum \text{pending\_limit\_effect} \quad (\text{status} = \text{'PENDING'})$$

---

## 3. Ödeme ve Tahsilat Kuralları (Payment & Collection Rules)
- **Yalnızca `CONFIRMED` Ödemeler Limiti Açar:**
  - `CONFIRMED` ödeme: `principal_effect = -amount` -> Açık borcu azaltır, kullanılabilir limiti artırır.
  - `PENDING` ödeme: Kullanılabilir limiti **DEĞİŞTİRMEZ**.
  - `FAILED` / `CANCELLED` ödeme: Etkisizdir.
- **Idempotency ve Referans Tekilliği:** Aynı ödeme referansı veya `idempotency_key` ikinci kez kullanılamaz. İkinci denemeler aynı sonucu döner (replay).
- **TBD — PAYMENT ALLOCATION BUSINESS RULE REQUIRED:**
  - *Pilot Varsayımı:* Ödemeler %100 oranında anapara borcunu azaltmak üzere uygulanır (Faiz/ücret dağılımı henüz tanımlanmamıştır ve canlı öncesi onaylanacaktır).

---

## 4. İade ve Reversal Kuralları (Refund & Reversal Rules)
- Yalnızca onaylanmış (`CONFIRMED`) iade hareketi limiti geri açar.
- İade tutarı orijinal satış tutarını aşamaz (`amount <= original_sale_amount`).
- Aynı satış/iade referansı için mükerrer iade işlenemez.
- `REVERSAL` işlemi, ilgili orijinal hareketin etkisini birebir tersler (`principal_effect` ters işarete döner).

---

## 5. Gecikme ve Bloke Politikası (Collections & Block Policy)
- `is_blocked = true` olan hesaplar, kullanılabilir limitleri (`available_limit > 0`) olsa dahi **YENİ KREDİLİ SATIŞ YAPAMAZ** (`REJECTED_ACCOUNT_BLOCKED`).
- *TBD — COLLECTIONS POLICY REQUIRED:* Vadesi geçen borç gün sayısı sınırı (örn: 30 gün) sonrası otomatik bloke koyma kuralı finans yönetimiyle netleştirilecektir.
