BEGIN;

-- ============================================================================
-- 1. ZORUNLU GİDER KATEGORİLERİNİ MEVCUT UUID'LERİ KORUYARAK KANONİKLEŞTİRME
-- ============================================================================
CREATE TEMP TABLE tmp_kasa_required_expense_categories (
  canonical_name TEXT PRIMARY KEY,
  display_order INT NOT NULL,
  is_salary BOOLEAN NOT NULL,
  aliases TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_kasa_required_expense_categories VALUES
 ('Personel Maaşı', 1, true, ARRAY['personel maaşı','personel maasi','maaş','maas']),
 ('Teknik Servis', 2, false, ARRAY['teknik servis','teknik servis gideri']),
 ('Yemek', 3, false, ARRAY['yemek','yemek / ikram','yemek/ikram','yemek ve ikram']),
 ('Kırtasiye', 4, false, ARRAY['kırtasiye','kirtasiye']),
 ('Malzeme', 5, false, ARRAY['malzeme']),
 ('Temizlik / Ofis Gideri', 6, false, ARRAY['temizlik / ofis gideri','temizlik/ofis gideri','temizlik','ofis temizliği','ofis temizligi','ofis gideri','temizlik / ofis','temizlik ve ofis gideri']),
 ('Diğer', 7, false, ARRAY['diğer','diger']);

CREATE TEMP TABLE tmp_kasa_required_expense_keepers (
  id UUID PRIMARY KEY,
  canonical_name TEXT UNIQUE
) ON COMMIT DROP;

CREATE TEMP TABLE tmp_kasa_expense_category_mappings (
  duplicate_category_id UUID PRIMARY KEY,
  keeper_category_id UUID NOT NULL,
  canonical_name TEXT NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  r RECORD;
  v_keeper UUID;
BEGIN
  FOR r IN SELECT * FROM tmp_kasa_required_expense_categories ORDER BY display_order LOOP
    -- 1. En uygun mevcut keeper kategoriyi seç (tam kanonik isim öncelikli, sonra aktiflik ve display_order)
    SELECT id INTO v_keeper FROM public.kasa_expense_categories
    WHERE name = r.canonical_name
       OR lower(trim(name)) = ANY(r.aliases)
       OR lower(trim(regexp_replace(name, '\s*\(Pasif Birleştirilmiş.*$', '', 'i'))) = ANY(r.aliases)
    ORDER BY (name = r.canonical_name) DESC, is_active DESC, display_order, created_at, id
    LIMIT 1;

    -- Mevcut kayıt yoksa yeni keeper oluştur
    IF v_keeper IS NULL THEN
      INSERT INTO public.kasa_expense_categories (name, display_order, is_salary_category, is_active)
      VALUES (r.canonical_name, r.display_order, r.is_salary, true)
      RETURNING id INTO v_keeper;
    END IF;

    -- Keeper kaydını güncelle
    UPDATE public.kasa_expense_categories
    SET name = r.canonical_name,
        display_order = r.display_order,
        is_salary_category = r.is_salary,
        is_active = true
    WHERE id = v_keeper;

    INSERT INTO tmp_kasa_required_expense_keepers VALUES (v_keeper, r.canonical_name);

    -- 2. Kategori isimleri bozulmadan önce bu kanonik aileye ait duplicate kategorileri açık eşleme tablosuna kaydet
    INSERT INTO tmp_kasa_expense_category_mappings (duplicate_category_id, keeper_category_id, canonical_name)
    SELECT c.id, v_keeper, r.canonical_name
    FROM public.kasa_expense_categories c
    WHERE c.id <> v_keeper
      AND (
        lower(trim(c.name)) = ANY(r.aliases)
        OR lower(trim(regexp_replace(c.name, '\s*\(Pasif Birleştirilmiş.*$', '', 'i'))) = ANY(r.aliases)
      )
    ON CONFLICT (duplicate_category_id) DO UPDATE SET
      keeper_category_id = EXCLUDED.keeper_category_id,
      canonical_name = EXCLUDED.canonical_name;
  END LOOP;
END $$;

-- 3. Giderleri YALNIZCA açık mapping tablosu üzerinden keeper UUID'ye taşı (Asla genel LIKE koşulu kullanma)
UPDATE public.kasa_expenses e
SET expense_category_id = m.keeper_category_id
FROM tmp_kasa_expense_category_mappings m
WHERE e.expense_category_id = m.duplicate_category_id;

-- 4. Eşlenen duplicate kategorileri pasifleştir ve isimlerini işaretle
UPDATE public.kasa_expense_categories c
SET is_active = false,
    name = CASE 
      WHEN c.name LIKE '%(Pasif Birleştirilmiş%' THEN c.name 
      ELSE c.name || ' (Pasif Birleştirilmiş ' || left(c.id::text, 8) || ')' 
    END
FROM tmp_kasa_expense_category_mappings m
WHERE c.id = m.duplicate_category_id;

-- 5. Zorunlu yedi kategori 1..7; diğer aktif/pasif kategoriler 8'den itibaren çakışmasız devam eder.
WITH extras AS (
  SELECT c.id, (7 + row_number() OVER(ORDER BY c.is_active DESC, c.display_order, c.created_at, c.id))::INT AS new_order
  FROM public.kasa_expense_categories c
  LEFT JOIN tmp_kasa_required_expense_keepers k ON k.id = c.id
  WHERE k.id IS NULL
)
UPDATE public.kasa_expense_categories c
SET display_order = extras.new_order
FROM extras
WHERE c.id = extras.id;

-- ============================================================================
-- 2. TABLO KOLONLARI, KISITLAR, İNDEKS GÜNCELLEMELERİ VE FAIL-CLOSED DOĞRULAMA
-- ============================================================================
ALTER TABLE public.kasa_expenses
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.kasa_bank_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS bank_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

UPDATE public.kasa_expenses SET payment_method = 'cash' WHERE payment_method IS NULL;

-- Fail-closed validation and safe category mapping for the 2026-08-31 cam silme expense
DO $$
DECLARE
  v_cam_silme_count INT;
  v_cam_silme_id UUID;
  v_cam_silme_status TEXT;
  v_cam_silme_pay_method TEXT;
  v_cam_silme_bank_acc UUID;
  v_cam_silme_bank_tx UUID;
  v_canonical_clean_id UUID;
BEGIN
  -- 1. Count matching cam silme records for 2026-08-31
  SELECT COUNT(*) INTO v_cam_silme_count
  FROM public.kasa_expenses e
  JOIN public.kasa_days d ON d.id = e.kasa_day_id
  WHERE d.date_val = DATE '2026-08-31'
    AND e.amount_kurus = 10000
    AND e.description ILIKE '%cam silme%';

  IF v_cam_silme_count <> 1 THEN
    RAISE EXCEPTION 'CAM_SILME_DOGRULAMA_HATASI: 2026-08-31 tarihli 100 TL cam silme gideri tam olarak 1 adet bulunamadı (Bulunan Adet: %).', v_cam_silme_count;
  END IF;

  -- 2. Inspect the existing record fields
  SELECT e.id, COALESCE(e.status, 'active'), e.payment_method, e.bank_account_id, e.bank_transaction_id
  INTO v_cam_silme_id, v_cam_silme_status, v_cam_silme_pay_method, v_cam_silme_bank_acc, v_cam_silme_bank_tx
  FROM public.kasa_expenses e
  JOIN public.kasa_days d ON d.id = e.kasa_day_id
  WHERE d.date_val = DATE '2026-08-31'
    AND e.amount_kurus = 10000
    AND e.description ILIKE '%cam silme%';

  IF v_cam_silme_status <> 'active' THEN
    RAISE EXCEPTION 'CAM_SILME_STATUS_INVALID: Beklenen active, bulunan %', v_cam_silme_status;
  END IF;

  IF v_cam_silme_pay_method IS DISTINCT FROM 'cash' THEN
    RAISE EXCEPTION 'CAM_SILME_PAYMENT_METHOD_INVALID: Beklenen cash, bulunan %', v_cam_silme_pay_method;
  END IF;

  -- 3. Fail-closed bank safety: if it has any bank account, bank tx id, or any related bank transactions (any status), REJECT
  IF v_cam_silme_bank_acc IS NOT NULL OR v_cam_silme_bank_tx IS NOT NULL THEN
    RAISE EXCEPTION 'CAM_SILME_BANKA_HATASI: 31 Ağustos cam silme giderinde beklenmeyen banka bağlantısı tespit edildi. Migration durduruldu.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.kasa_bank_transactions
    WHERE related_expense_id = v_cam_silme_id
  ) THEN
    RAISE EXCEPTION 'CAM_SILME_ILISKILI_BANKA_ISLEMI: 31 Ağustos cam silme giderine bağlı banka hareketi tespit edildi. Migration durduruldu.';
  END IF;

  -- 4. Verify canonical category keeper
  SELECT id INTO v_canonical_clean_id
  FROM tmp_kasa_required_expense_keepers
  WHERE canonical_name = 'Temizlik / Ofis Gideri';

  IF v_canonical_clean_id IS NULL THEN
    RAISE EXCEPTION 'KANONIK_KATEGORI_BULUNAMADI: Temizlik / Ofis Gideri kanonik kategorisi bulunamadı.';
  END IF;

  -- 5. Only re-point category to canonical keeper (keep payment_method='cash', amount, day, movements intact)
  UPDATE public.kasa_expenses
  SET expense_category_id = v_canonical_clean_id
  WHERE id = v_cam_silme_id;
END $$;

ALTER TABLE public.kasa_expenses ALTER COLUMN payment_method SET DEFAULT 'cash';
ALTER TABLE public.kasa_expenses ALTER COLUMN payment_method SET NOT NULL;

ALTER TABLE public.kasa_expenses DROP CONSTRAINT IF EXISTS chk_kasa_expenses_payment_method;
ALTER TABLE public.kasa_expenses ADD CONSTRAINT chk_kasa_expenses_payment_method CHECK (
  (payment_method = 'cash' AND bank_account_id IS NULL)
  OR (payment_method = 'bank' AND bank_account_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kasa_expenses_idempotency_key
  ON public.kasa_expenses(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kasa_expenses_bank_transaction_id
  ON public.kasa_expenses(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.kasa_expenses ADD CONSTRAINT fk_kasa_expenses_bank_transaction
    FOREIGN KEY (bank_transaction_id) REFERENCES public.kasa_bank_transactions(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Banka hareket türlerine expense_reversal ekle
ALTER TABLE public.kasa_bank_transactions DROP CONSTRAINT IF EXISTS chk_kasa_bank_tx_type;
ALTER TABLE public.kasa_bank_transactions ADD CONSTRAINT chk_kasa_bank_tx_type CHECK (transaction_type IN (
  'opening_balance',
  'capital_injection',
  'owner_withdrawal',
  'pos_settlement',
  'bank_expense',
  'expense_reversal',
  'ts_cost_payment',
  'bank_transfer_in',
  'bank_transfer_out',
  'bank_to_cash_withdrawal',
  'cash_to_bank_deposit',
  'bank_adjustment'
));

-- ============================================================================
-- 3. FİZİKSEL KASA HESAPLAMA FONKSİYONU
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_get_physical_cash(p_kasa_day_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day public.kasa_days%ROWTYPE;
  v_sales BIGINT := 0;
  v_credit BIGINT := 0;
  v_exp BIGINT := 0;
  v_deposits BIGINT := 0;
  v_fx BIGINT := 0;
  v_ts_out BIGINT := 0;
  v_ts_in BIGINT := 0;
  v_bank_to_cash BIGINT := 0;
BEGIN
  SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_sales
  FROM public.kasa_sales WHERE kasa_day_id = p_kasa_day_id AND status = 'completed';

  SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_credit
  FROM public.kasa_credit_payments WHERE kasa_day_id = p_kasa_day_id;

  SELECT COALESCE(SUM(amount_kurus), 0) INTO v_exp
  FROM public.kasa_expenses
  WHERE kasa_day_id = p_kasa_day_id
    AND (status = 'active' OR status IS NULL)
    AND payment_method = 'cash';

  SELECT COALESCE(SUM(amount_kurus), 0) INTO v_deposits
  FROM public.kasa_bank_deposits WHERE kasa_day_id = p_kasa_day_id;

  SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_fx
  FROM public.kasa_fx_transactions WHERE kasa_day_id = p_kasa_day_id AND transaction_type = 'fx_conversion_to_try';

  SELECT COALESCE(SUM(ABS(cash_portion_kurus)), 0) INTO v_ts_out
  FROM public.kasa_movements WHERE kasa_day_id = p_kasa_day_id AND movement_type = 'ts_cost_cash_payment';

  SELECT COALESCE(SUM(cash_portion_kurus), 0) INTO v_ts_in
  FROM public.kasa_movements WHERE kasa_day_id = p_kasa_day_id AND movement_type = 'ts_cost_cash_refund';

  SELECT COALESCE(SUM(cash_portion_kurus), 0) INTO v_bank_to_cash
  FROM public.kasa_movements WHERE kasa_day_id = p_kasa_day_id AND movement_type = 'bank_to_cash';

  RETURN v_day.opening_balance_kurus
       + v_day.capital_injected_kurus
       - v_day.owner_withdrawn_kurus
       + v_sales
       + v_credit
       + v_fx
       + v_ts_in
       + v_bank_to_cash
       - v_exp
       - v_deposits
       - v_ts_out;
END;
$$;

-- ============================================================================
-- 4. ESKİ GİDER RPC OVERLOAD'LARINI GÜVENLİ TEMİZLEME
-- ============================================================================
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('fn_kasa_create_expense', 'fn_kasa_update_expense', 'fn_kasa_cancel_expense')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s)', f.proname, f.args);
  END LOOP;
END $$;

-- ============================================================================
-- 5. GİDER RPC'LERİ (CREATE, CANCEL, UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_create_expense(
  p_actor_user_id UUID,
  p_kasa_day_id UUID,
  p_expense_category_id UUID,
  p_amount_kurus BIGINT,
  p_description TEXT,
  p_recipient_name TEXT,
  p_sale_id UUID,
  p_payment_method TEXT,
  p_bank_account_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.kasa_users%ROWTYPE;
  v_day public.kasa_days%ROWTYPE;
  v_cat public.kasa_expense_categories%ROWTYPE;
  v_acc public.kasa_bank_accounts%ROWTYPE;
  v_exp public.kasa_expenses%ROWTYPE;
  v_tx UUID;
  v_cached public.kasa_expenses%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
  END IF;

  IF p_payment_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'GECERSIZ_ODEME_YONTEMI: Ödeme yöntemi cash veya bank olmalıdır.';
  END IF;

  IF p_amount_kurus IS NULL OR p_amount_kurus <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: Tutar kuruş cinsinden pozitif tam sayı olmalıdır.';
  END IF;

  IF p_description IS NULL OR trim(p_description) = '' THEN
    RAISE EXCEPTION 'GECERSIZ_ACIKLAMA: Açıklama zorunludur.';
  END IF;

  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_ZORUNLU';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(trim(p_idempotency_key), 0));

  SELECT * INTO v_cached FROM public.kasa_expenses WHERE idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN
    IF v_cached.created_by_user_id IS DISTINCT FROM p_actor_user_id
       OR v_cached.kasa_day_id IS DISTINCT FROM p_kasa_day_id
       OR v_cached.expense_category_id IS DISTINCT FROM p_expense_category_id
       OR v_cached.amount_kurus IS DISTINCT FROM p_amount_kurus
       OR trim(v_cached.description) IS DISTINCT FROM trim(p_description)
       OR NULLIF(trim(v_cached.recipient_name), '') IS DISTINCT FROM NULLIF(trim(p_recipient_name), '')
       OR v_cached.sale_id IS DISTINCT FROM p_sale_id
       OR v_cached.payment_method IS DISTINCT FROM p_payment_method
       OR v_cached.bank_account_id IS DISTINCT FROM p_bank_account_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Aynı anahtar farklı istekle kullanıldı.';
    END IF;
    RETURN to_jsonb(v_cached);
  END IF;

  SELECT * INTO v_cat FROM public.kasa_expense_categories WHERE id = p_expense_category_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GECERSIZ_KATEGORI';
  END IF;

  IF v_cat.is_salary_category AND v_actor.role <> 'yonetici' THEN
    RAISE EXCEPTION 'YETKISIZ: Maaş giderini yalnız yönetici kaydedebilir.';
  END IF;

  SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
  IF NOT FOUND OR v_day.status <> 'open' THEN
    RAISE EXCEPTION 'KAPALI_GUN: Kapalı güne gider yazılamaz.';
  END IF;

  IF p_payment_method = 'cash' THEN
    IF p_bank_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Nakit giderde banka hesabı seçilemez.';
    END IF;
    IF public.fn_kasa_get_physical_cash(p_kasa_day_id) < p_amount_kurus THEN
      RAISE EXCEPTION 'YETERSIZ_NAKIT: Kasada bu gider için yeterli nakit bulunmuyor.';
    END IF;
  ELSE
    IF v_actor.role <> 'yonetici' THEN
      RAISE EXCEPTION 'YETKISIZ: Banka gideri yalnız yönetici tarafından kaydedilebilir.';
    END IF;
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'BANKA_HESABI_ZORUNLU';
    END IF;
    SELECT * INTO v_acc FROM public.kasa_bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND OR NOT v_acc.is_active OR v_acc.currency_code <> 'TRY' THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Aktif TRY hesabı seçilmelidir.';
    END IF;
    IF v_acc.current_balance_kurus < p_amount_kurus THEN
      RAISE EXCEPTION 'YETERSIZ_BANKA_BAKIYESI';
    END IF;
  END IF;

  INSERT INTO public.kasa_expenses (
    kasa_day_id, expense_category_id, sale_id, amount_kurus, description,
    recipient_name, created_by_user_id, payment_method, bank_account_id, idempotency_key
  ) VALUES (
    p_kasa_day_id, p_expense_category_id, p_sale_id, p_amount_kurus, trim(p_description),
    NULLIF(trim(p_recipient_name), ''), p_actor_user_id, p_payment_method, p_bank_account_id, trim(p_idempotency_key)
  ) RETURNING * INTO v_exp;

  IF p_payment_method = 'cash' THEN
    INSERT INTO public.kasa_movements (
      kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
      p_kasa_day_id,
      CASE WHEN v_cat.is_salary_category THEN 'salary_payment' ELSE 'nakit_gider' END,
      p_sale_id, -p_amount_kurus, -p_amount_kurus, 0,
      'Nakit Gider (' || v_cat.name || '): ' || trim(p_description), p_actor_user_id
    );
  ELSE
    INSERT INTO public.kasa_bank_transactions (
      bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
      description, related_expense_id, status, created_by_user_id
    ) VALUES (
      p_bank_account_id, 'bank_expense', 'out', p_amount_kurus, v_day.date_val,
      'Gider Ödemesi: ' || trim(p_description), v_exp.id, 'active', p_actor_user_id
    ) RETURNING id INTO v_tx;

    UPDATE public.kasa_expenses SET bank_transaction_id = v_tx WHERE id = v_exp.id RETURNING * INTO v_exp;
    PERFORM public.fn_kasa_recalculate_bank_balance(p_bank_account_id);
  END IF;

  INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_actor_user_id, 'gider_eklendi', 'kasa_expenses', v_exp.id,
    jsonb_build_object('amount_kurus', p_amount_kurus, 'payment_method', p_payment_method, 'bank_account_id', p_bank_account_id)
  );

  RETURN to_jsonb(v_exp);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_expense(
  p_actor_user_id UUID,
  p_expense_id UUID,
  p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.kasa_users%ROWTYPE;
  v_exp public.kasa_expenses%ROWTYPE;
  v_day public.kasa_days%ROWTYPE;
  v_result public.kasa_expenses%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
  END IF;

  IF p_justification IS NULL OR trim(p_justification) = '' THEN
    RAISE EXCEPTION 'GEREKCE_ZORUNLU';
  END IF;

  SELECT * INTO v_exp FROM public.kasa_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND OR v_exp.status <> 'active' THEN
    RAISE EXCEPTION 'GECERSIZ_GIDER';
  END IF;

  IF v_actor.role <> 'yonetici' AND (
    v_exp.created_by_user_id <> p_actor_user_id
    OR v_exp.payment_method = 'bank'
    OR EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = v_exp.expense_category_id AND is_salary_category = true)
  ) THEN
    RAISE EXCEPTION 'YETKISIZ: Personel yalnızca kendi kaydettiği nakit ve maaş dışı giderleri iptal edebilir.';
  END IF;

  SELECT * INTO v_day FROM public.kasa_days WHERE id = v_exp.kasa_day_id FOR UPDATE;
  IF v_day.status <> 'open' THEN
    RAISE EXCEPTION 'KAPALI_GUN: Kapalı günün gideri iptal edilemez.';
  END IF;

  IF v_exp.payment_method = 'cash' THEN
    INSERT INTO public.kasa_movements (
      kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
      v_exp.kasa_day_id, 'gider_iptal', v_exp.amount_kurus, v_exp.amount_kurus,
      'Nakit gider iptal ters kaydı', trim(p_justification), p_actor_user_id
    );
  ELSE
    INSERT INTO public.kasa_bank_transactions (
      bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
      description, justification, related_expense_id, status, created_by_user_id
    ) VALUES (
      v_exp.bank_account_id, 'expense_reversal', 'in', v_exp.amount_kurus, v_day.date_val,
      'Gider Ödemesi İptal Ters Kaydı', trim(p_justification), v_exp.id, 'active', p_actor_user_id
    );
    PERFORM public.fn_kasa_recalculate_bank_balance(v_exp.bank_account_id);
  END IF;

  UPDATE public.kasa_expenses
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_user_id = p_actor_user_id,
      cancel_reason = trim(p_justification)
  WHERE id = p_expense_id
  RETURNING * INTO v_result;

  INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_actor_user_id, 'gider_iptal_edildi', 'kasa_expenses', p_expense_id,
    jsonb_build_object('justification', trim(p_justification), 'payment_method', v_exp.payment_method, 'amount_kurus', v_exp.amount_kurus)
  );

  RETURN to_jsonb(v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_kasa_update_expense(
  p_actor_user_id UUID,
  p_expense_id UUID,
  p_expense_category_id UUID,
  p_amount_kurus BIGINT,
  p_description TEXT,
  p_recipient_name TEXT,
  p_justification TEXT,
  p_payment_method TEXT,
  p_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.kasa_users%ROWTYPE;
  v_exp public.kasa_expenses%ROWTYPE;
  v_day public.kasa_days%ROWTYPE;
  v_cat public.kasa_expense_categories%ROWTYPE;
  v_acc public.kasa_bank_accounts%ROWTYPE;
  v_result public.kasa_expenses%ROWTYPE;
  v_tx UUID;
  v_cash BIGINT;
BEGIN
  SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
  END IF;

  SELECT * INTO v_exp FROM public.kasa_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND OR v_exp.status <> 'active' THEN
    RAISE EXCEPTION 'GECERSIZ_GIDER';
  END IF;

  SELECT * INTO v_day FROM public.kasa_days WHERE id = v_exp.kasa_day_id FOR UPDATE;
  IF v_day.status <> 'open' THEN
    RAISE EXCEPTION 'KAPALI_GUN: Kapalı günün gideri düzeltilemez.';
  END IF;

  SELECT * INTO v_cat FROM public.kasa_expense_categories WHERE id = p_expense_category_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GECERSIZ_KATEGORI';
  END IF;

  IF p_amount_kurus <= 0 OR trim(COALESCE(p_description, '')) = '' OR trim(COALESCE(p_justification, '')) = '' THEN
    RAISE EXCEPTION 'GECERSIZ_PARAMETRE: Tutar, açıklama ve gerekçe zorunludur.';
  END IF;

  IF p_payment_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'GECERSIZ_ODEME_YONTEMI';
  END IF;

  IF v_actor.role <> 'yonetici' AND (
    v_exp.created_by_user_id <> p_actor_user_id
    OR v_exp.payment_method = 'bank'
    OR p_payment_method = 'bank'
    OR v_cat.is_salary_category
    OR EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = v_exp.expense_category_id AND is_salary_category = true)
  ) THEN
    RAISE EXCEPTION 'YETKISIZ: Personel yalnızca kendi kaydettiği nakit ve maaş dışı giderleri düzeltebilir.';
  END IF;

  -- Sadece kategori/açıklama/alıcı değişiyorsa finansal ters/yeni kayıt üretme.
  IF v_exp.amount_kurus = p_amount_kurus
     AND v_exp.payment_method = p_payment_method
     AND v_exp.bank_account_id IS NOT DISTINCT FROM p_bank_account_id THEN
    UPDATE public.kasa_expenses
    SET expense_category_id = p_expense_category_id,
        description = trim(p_description),
        recipient_name = NULLIF(trim(p_recipient_name), '')
    WHERE id = p_expense_id
    RETURNING * INTO v_result;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      p_actor_user_id, 'gider_bilgileri_duzeltildi', 'kasa_expenses', p_expense_id,
      jsonb_build_object('justification', trim(p_justification), 'old_category_id', v_exp.expense_category_id,
        'new_category_id', p_expense_category_id, 'financial_effect_changed', false)
    );
    RETURN to_jsonb(v_result);
  END IF;

  -- Önce eski finansal etkiyi tersle
  IF v_exp.payment_method = 'cash' THEN
    INSERT INTO public.kasa_movements (
      kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
      v_exp.kasa_day_id, 'gider_duzeltme_iptal', v_exp.amount_kurus, v_exp.amount_kurus,
      'Gider düzeltme eski kayıt terslemesi', trim(p_justification), p_actor_user_id
    );
  ELSE
    INSERT INTO public.kasa_bank_transactions (
      bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
      description, justification, related_expense_id, status, created_by_user_id
    ) VALUES (
      v_exp.bank_account_id, 'expense_reversal', 'in', v_exp.amount_kurus, v_day.date_val,
      'Gider düzeltme eski banka ödemesi terslemesi', trim(p_justification), v_exp.id, 'active', p_actor_user_id
    );
    PERFORM public.fn_kasa_recalculate_bank_balance(v_exp.bank_account_id);
  END IF;

  IF p_payment_method = 'cash' THEN
    IF p_bank_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Nakit giderde banka hesabı seçilemez.';
    END IF;
    v_cash := public.fn_kasa_get_physical_cash(v_exp.kasa_day_id) + CASE WHEN v_exp.payment_method = 'cash' THEN v_exp.amount_kurus ELSE 0 END;
    IF v_cash < p_amount_kurus THEN
      RAISE EXCEPTION 'YETERSIZ_NAKIT: Kasada bu gider için yeterli nakit bulunmuyor.';
    END IF;
    INSERT INTO public.kasa_movements (
      kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
      v_exp.kasa_day_id, 'gider_duzeltme_yeni', -p_amount_kurus, -p_amount_kurus,
      'Nakit Gider düzeltme yeni kayıt: ' || trim(p_description), trim(p_justification), p_actor_user_id
    );
    v_tx := NULL;
  ELSE
    IF v_actor.role <> 'yonetici' OR p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'YETKISIZ_BANKA_GIDERI';
    END IF;
    SELECT * INTO v_acc FROM public.kasa_bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND OR NOT v_acc.is_active OR v_acc.currency_code <> 'TRY' THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI';
    END IF;
    IF v_acc.current_balance_kurus < p_amount_kurus THEN
      RAISE EXCEPTION 'YETERSIZ_BANKA_BAKIYESI';
    END IF;
    INSERT INTO public.kasa_bank_transactions (
      bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
      description, justification, related_expense_id, status, created_by_user_id
    ) VALUES (
      p_bank_account_id, 'bank_expense', 'out', p_amount_kurus, v_day.date_val,
      'Gider Ödemesi (düzeltme): ' || trim(p_description), trim(p_justification), v_exp.id, 'active', p_actor_user_id
    ) RETURNING id INTO v_tx;
    PERFORM public.fn_kasa_recalculate_bank_balance(p_bank_account_id);
  END IF;

  UPDATE public.kasa_expenses
  SET expense_category_id = p_expense_category_id,
      amount_kurus = p_amount_kurus,
      description = trim(p_description),
      recipient_name = NULLIF(trim(p_recipient_name), ''),
      payment_method = p_payment_method,
      bank_account_id = p_bank_account_id,
      bank_transaction_id = v_tx
  WHERE id = p_expense_id
  RETURNING * INTO v_result;

  INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_actor_user_id, 'gider_duzeltildi', 'kasa_expenses', p_expense_id,
    jsonb_build_object('justification', trim(p_justification), 'old_payment_method', v_exp.payment_method, 'new_payment_method', p_payment_method, 'old_amount_kurus', v_exp.amount_kurus, 'new_amount_kurus', p_amount_kurus)
  );

  RETURN to_jsonb(v_result);
END;
$$;

-- ============================================================================
-- 6. RPC GÜVENLİK VE YETKİLENDİRME (SERVICE_ROLE ONLY)
-- ============================================================================
REVOKE ALL ON FUNCTION public.fn_kasa_get_physical_cash(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_update_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_get_physical_cash(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

COMMIT;
