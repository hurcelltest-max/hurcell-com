-- ============================================================================
-- Migration: 20260901190000_kasa_sale_integrity_v11.sql
-- Description: HurCELL Kasa V11 - Kronolojik Gün Kilidi, Atomik Satış Hareketi
--              ve 15 Satışlık Kapsamlı Veri / Devir Onarımı
-- Güvenlik: Fail-closed transaction, SECURITY DEFINER, search_path = public, pg_temp,
--           REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT TO service_role only.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ORTAK KRONOLOJİK GÜN VE AÇIK GÜN KİLİT FONKSİYONU
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_assert_active_day_for_mutation(
    p_kasa_day_id UUID
)
RETURNS public.kasa_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_day public.kasa_days%ROWTYPE;
    v_today_ist DATE;
BEGIN
    IF p_kasa_day_id IS NULL THEN
        RAISE EXCEPTION 'KASA_GUNU_BULUNAMADI: Geçerli bir kasa günü belirtilmelidir.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'KASA_GUNU_BULUNAMADI: Belirtilen kasa günü bulunamadı.';
    END IF;

    IF v_day.status <> 'open' THEN
        RAISE EXCEPTION 'KASA_GUNU_KAPALI: Finansal işlem yalnızca açık kasa gününde yapılabilir.';
    END IF;

    v_today_ist := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date;

    IF v_day.date_val <> v_today_ist THEN
        RAISE EXCEPTION 'KASA_GUNU_TARIH_UYUSMAZLIGI: Kasa günü tarihi (%) bugünün İstanbul tarihi (%) ile uyuşmuyor. Lütfen açık günü kapatıp bugünün gününü açınız.',
            v_day.date_val, v_today_ist;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.kasa_days
        WHERE status = 'open' AND date_val < v_day.date_val
    ) THEN
        RAISE EXCEPTION 'ONCEKI_KASA_GUNU_KAPATILMADI: Önceki tarihlere ait açık kasa günü kapatılmadan yeni gün işlemi yapılamaz.';
    END IF;

    RETURN v_day;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_assert_active_day_for_mutation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_assert_active_day_for_mutation(UUID) TO service_role;

-- ============================================================================
-- 2. CANONICAL 32-PARAMETRELİ FN_KASA_CREATE_SALE (ATOMİK HAREKET VE GÜN KİLİTLİ)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT DEFAULT NULL::bigint,
    p_service_cost_kurus BIGINT DEFAULT NULL::bigint,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_reference TEXT DEFAULT NULL::text,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL::numeric,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL::numeric,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_credit_customer_id UUID DEFAULT NULL::uuid,
    p_credit_paid_kurus BIGINT DEFAULT 0,
    p_uncollected_credit_kurus BIGINT DEFAULT 0,
    p_uncollected_cost_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL::text,
    p_customer_name TEXT DEFAULT NULL::text,
    p_customer_phone TEXT DEFAULT NULL::text,
    p_serial_imei TEXT DEFAULT NULL::text,
    p_technical_service_details JSONB DEFAULT NULL::jsonb,
    p_service_cost_payment_status TEXT DEFAULT NULL::text,
    p_service_cost_payment_source TEXT DEFAULT NULL::text,
    p_service_cost_bank_account_id UUID DEFAULT NULL::uuid,
    p_idempotency_key TEXT DEFAULT NULL::text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_day public.kasa_days%ROWTYPE;
    v_bank_rec RECORD;
    v_cat_name TEXT;
    v_payload JSONB;
    v_cached JSONB;
    v_sale_id UUID;
    v_bank_tx_id UUID;
    v_receipt_no TEXT;
    v_seq_val BIGINT;
    v_res JSONB;
BEGIN
    IF p_product_name IS NULL OR TRIM(p_product_name) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_ÜRÜN_ADI: Ürün / Hizmet adı zorunludur.';
    END IF;

    -- Kronolojik gün ve açık gün kilidi
    v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

    -- Actor user validation and Manager role check for bank payments
    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    IF (p_service_cost_payment_status = 'paid_from_bank' OR p_service_cost_payment_source = 'bank') THEN
        IF v_actor_role <> 'yonetici' THEN
            RAISE EXCEPTION 'BANKA_ÖDEMESİ_YETKİSİZ: Bankadan maliyet ödemesi yalnız yönetici yetkisindedir.';
        END IF;
    END IF;

    SELECT name INTO v_cat_name FROM public.kasa_categories WHERE id = p_category_id;

    v_payload := jsonb_build_object(
        'kasa_day_id', p_kasa_day_id,
        'category_id', p_category_id,
        'product_name', TRIM(p_product_name),
        'total_price_kurus', p_total_price_kurus,
        'service_cost_kurus', p_service_cost_kurus,
        'service_cost_payment_status', p_service_cost_payment_status,
        'service_cost_bank_account_id', p_service_cost_bank_account_id,
        'cash_paid_kurus', p_cash_paid_kurus,
        'card_paid_kurus', p_card_paid_kurus,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_bank' THEN
        IF p_service_cost_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'EKSİK_BANKA_HESABI: Bankadan ödenen teknik servis maliyeti için banka hesabı seçilmelidir.';
        END IF;
        IF COALESCE(p_service_cost_kurus, 0) <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_MALİYET: Bankadan ödenen servis maliyeti 0 TL den büyük olmalıdır.';
        END IF;

        SELECT * INTO v_bank_rec FROM public.kasa_bank_accounts WHERE id = p_service_cost_bank_account_id FOR UPDATE;
        IF NOT FOUND OR NOT v_bank_rec.is_active THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Seçilen banka hesabı bulunamadı veya pasif durumda.';
        END IF;
        IF v_bank_rec.current_balance_kurus < p_service_cost_kurus THEN
            RAISE EXCEPTION 'YETERSİZ_BAKİYE: Banka hesabında servis maliyeti ödemesi için yeterli bakiye yok.';
        END IF;
    END IF;

    -- Sequence üretimi: Doğrulamalardan ve Idempotency kontrolünden sonra
    v_seq_val := nextval('public.kasa_receipt_seq');
    v_receipt_no := 'FS-' || to_char(v_day.date_val, 'YYYYMMDD') || '-' || lpad(v_seq_val::text, 5, '0');

    -- 1. Satış Kaydını Oluştur (kasa_sales)
    INSERT INTO public.kasa_sales (
        receipt_no,
        kasa_day_id, category_id, product_name, quantity, unit_price_kurus, total_price_kurus,
        cost_price_kurus, service_cost_kurus, cash_paid_kurus, card_paid_kurus,
        bank_transfer_paid_kurus, bank_transfer_reference, usd_paid_cents, usd_rate,
        usd_tl_equivalent_kurus, eur_paid_cents, eur_rate, eur_tl_equivalent_kurus,
        credit_customer_id, credit_paid_kurus, uncollected_credit_kurus, uncollected_cost_kurus,
        description, customer_name, customer_phone, serial_imei, technical_service_details,
        service_cost_payment_status, service_cost_payment_source, service_cost_bank_account_id,
        service_cost_paid_at, service_cost_paid_by_user_id, status, created_by_user_id
    ) VALUES (
        v_receipt_no,
        p_kasa_day_id, p_category_id, TRIM(p_product_name), p_quantity, p_unit_price_kurus, p_total_price_kurus,
        p_cost_price_kurus, p_service_cost_kurus, p_cash_paid_kurus, p_card_paid_kurus,
        p_bank_transfer_paid_kurus, p_bank_transfer_reference, p_usd_paid_cents, p_usd_rate,
        p_usd_tl_equivalent_kurus, p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus,
        p_credit_customer_id, p_credit_paid_kurus, p_uncollected_credit_kurus, p_uncollected_cost_kurus,
        p_description, p_customer_name, p_customer_phone, p_serial_imei, p_technical_service_details,
        CASE WHEN v_cat_name = 'Teknik Servis' THEN p_service_cost_payment_status ELSE COALESCE(p_service_cost_payment_status, 'previously_paid_or_stock') END,
        CASE WHEN v_cat_name = 'Teknik Servis' THEN p_service_cost_payment_source ELSE NULL END,
        CASE WHEN v_cat_name = 'Teknik Servis' THEN p_service_cost_bank_account_id ELSE NULL END,
        CASE WHEN v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status IN ('paid_from_bank', 'paid_from_cash') THEN now() ELSE NULL END,
        CASE WHEN v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status IN ('paid_from_bank', 'paid_from_cash') THEN p_actor_user_id ELSE NULL END,
        'completed', p_actor_user_id
    ) RETURNING id INTO v_sale_id;

    -- 2. Atomik Kasa Hareketi Oluştur (kasa_movements)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'satis', v_sale_id, p_total_price_kurus, p_cash_paid_kurus, p_card_paid_kurus, p_bank_transfer_paid_kurus,
        'Satış (' || v_receipt_no || '): ' || TRIM(p_product_name), p_actor_user_id
    );

    -- 3. Teknik Servis Nakit Maliyet Ödemesi Hareketi (paid_from_cash ise aynı tx içinde)
    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_cash' AND COALESCE(p_service_cost_kurus, 0) > 0 THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'ts_cost_cash_payment', v_sale_id, -p_service_cost_kurus, -p_service_cost_kurus, 0,
            'Teknik Servis Nakit Maliyet Ödemesi (' || v_receipt_no || '): ' || TRIM(p_product_name), p_actor_user_id
        );
    END IF;

    -- 4. Teknik Servis Banka Ödemesi Hareketi
    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_bank' THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, related_sale_id, created_by_user_id
        ) VALUES (
            p_service_cost_bank_account_id, 'ts_cost_payment', 'out', p_service_cost_kurus, v_day.date_val,
            'Teknik Servis Maliyet Ödemesi (Satış Anında)', v_sale_id, p_actor_user_id
        ) RETURNING id INTO v_bank_tx_id;

        PERFORM public.fn_kasa_recalculate_bank_balance(p_service_cost_bank_account_id);
    END IF;

    v_res := jsonb_build_object('success', true, 'sale_id', v_sale_id, 'receipt_no', v_receipt_no, 'bank_transaction_id', v_bank_tx_id);

    -- Idempotency kaydını ancak satış ve hareketler atomik olarak oluştuktan sonra kaydet
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'create_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

-- ============================================================================
-- 3. GEÇİŞ DÖNEMİ UYUMLULUK WRAPPER'I (31-PARAMETRELİ)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT DEFAULT NULL::bigint,
    p_service_cost_kurus BIGINT DEFAULT NULL::bigint,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_reference TEXT DEFAULT NULL::text,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL::numeric,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL::numeric,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_credit_customer_id UUID DEFAULT NULL::uuid,
    p_credit_paid_kurus BIGINT DEFAULT 0,
    p_uncollected_credit_kurus BIGINT DEFAULT 0,
    p_uncollected_cost_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL::text,
    p_customer_name TEXT DEFAULT NULL::text,
    p_customer_phone TEXT DEFAULT NULL::text,
    p_serial_imei TEXT DEFAULT NULL::text,
    p_technical_service_details JSONB DEFAULT NULL::jsonb,
    p_service_cost_payment_status TEXT DEFAULT NULL::text,
    p_service_cost_payment_source TEXT DEFAULT NULL::text,
    p_service_cost_bank_account_id UUID DEFAULT NULL::uuid,
    p_idempotency_key TEXT DEFAULT NULL::text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fallback_product_name TEXT;
BEGIN
    SELECT name INTO v_fallback_product_name FROM public.kasa_categories WHERE id = p_category_id;
    IF v_fallback_product_name IS NULL OR TRIM(v_fallback_product_name) = '' THEN
        v_fallback_product_name := 'Satış';
    END IF;

    RETURN public.fn_kasa_create_sale(
        p_actor_user_id := p_actor_user_id,
        p_kasa_day_id := p_kasa_day_id,
        p_category_id := p_category_id,
        p_product_name := v_fallback_product_name,
        p_quantity := p_quantity,
        p_unit_price_kurus := p_unit_price_kurus,
        p_total_price_kurus := p_total_price_kurus,
        p_cost_price_kurus := p_cost_price_kurus,
        p_service_cost_kurus := p_service_cost_kurus,
        p_cash_paid_kurus := p_cash_paid_kurus,
        p_card_paid_kurus := p_card_paid_kurus,
        p_bank_transfer_paid_kurus := p_bank_transfer_paid_kurus,
        p_bank_transfer_reference := p_bank_transfer_reference,
        p_usd_paid_cents := p_usd_paid_cents,
        p_usd_rate := p_usd_rate,
        p_usd_tl_equivalent_kurus := p_usd_tl_equivalent_kurus,
        p_eur_paid_cents := p_eur_paid_cents,
        p_eur_rate := p_eur_rate,
        p_eur_tl_equivalent_kurus := p_eur_tl_equivalent_kurus,
        p_credit_customer_id := p_credit_customer_id,
        p_credit_paid_kurus := p_credit_paid_kurus,
        p_uncollected_credit_kurus := p_uncollected_credit_kurus,
        p_uncollected_cost_kurus := p_uncollected_cost_kurus,
        p_description := p_description,
        p_customer_name := p_customer_name,
        p_customer_phone := p_customer_phone,
        p_serial_imei := p_serial_imei,
        p_technical_service_details := p_technical_service_details,
        p_service_cost_payment_status := p_service_cost_payment_status,
        p_service_cost_payment_source := p_service_cost_payment_source,
        p_service_cost_bank_account_id := p_service_cost_bank_account_id,
        p_idempotency_key := p_idempotency_key
    );
END;
$$;

-- Satış başına tam bir canonical satis hareketi için partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_kasa_movements_sale_satis
ON public.kasa_movements (sale_id) WHERE movement_type = 'satis';

-- Yetkiler
REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) TO service_role;

-- ============================================================================
-- 4. FN_KASA_CREATE_EXPENSE KRONOLOJİK GÜN KORUMASI ENTEGRASYONU
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

  IF p_payment_method = 'bank' AND v_actor.role <> 'yonetici' THEN
    RAISE EXCEPTION 'YETKISIZ: Bankadan gider ekleme yetkisi yalnızca yöneticilere aittir.';
  END IF;

  IF p_amount_kurus IS NULL OR p_amount_kurus <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: Gider tutarı 0 TL den büyük olmalıdır.';
  END IF;

  IF p_description IS NULL OR trim(p_description) = '' THEN
    RAISE EXCEPTION 'GECERSIZ_ACIKLAMA: Gider açıklaması zorunludur.';
  END IF;

  -- Kronolojik gün ve açık gün kilidi
  v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

  SELECT * INTO v_cat FROM public.kasa_expense_categories WHERE id = p_expense_category_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GECERSIZ_KATEGORI: Gider kategorisi bulunamadı veya pasif.';
  END IF;

  IF p_payment_method = 'bank' THEN
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Bankadan ödenen giderler için banka hesabı seçilmelidir.';
    END IF;

    SELECT * INTO v_acc FROM public.kasa_bank_accounts WHERE id = p_bank_account_id AND is_active = true FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Seçilen banka hesabı bulunamadı veya pasif.';
    END IF;

    IF v_acc.current_balance_kurus < p_amount_kurus THEN
      RAISE EXCEPTION 'YETERSIZ_BAKIYE: Banka hesabında bu gideri karşılayacak yeterli bakiye bulunmuyor.';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_cached FROM public.kasa_expenses WHERE idempotency_key = trim(p_idempotency_key);
    IF FOUND THEN
      RETURN to_jsonb(v_cached);
    END IF;
  END IF;

  INSERT INTO public.kasa_expenses (
    kasa_day_id, expense_category_id, amount_kurus, description,
    recipient_name, sale_id, payment_method, bank_account_id,
    idempotency_key, created_by_user_id
  ) VALUES (
    p_kasa_day_id, p_expense_category_id, p_amount_kurus, trim(p_description),
    nullif(trim(p_recipient_name), ''), p_sale_id, p_payment_method,
    CASE WHEN p_payment_method = 'bank' THEN p_bank_account_id ELSE NULL END,
    nullif(trim(p_idempotency_key), ''), p_actor_user_id
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

REVOKE ALL ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID, TEXT) TO service_role;

-- ============================================================================
-- 5. FN_KASA_COLLECT_CREDIT_PAYMENT KRONOLOJİK GÜN KORUMASI ENTEGRASYONU
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_collect_credit_payment(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_credit_customer_id UUID,
    p_amount_kurus BIGINT,
    p_payment_method TEXT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC,
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC,
    p_eur_tl_equivalent_kurus BIGINT,
    p_description TEXT,
    p_idempotency_key TEXT,
    p_bank_transfer_paid_kurus BIGINT,
    p_bank_transfer_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_customer public.credit_customers%ROWTYPE;
    v_account public.credit_accounts%ROWTYPE;
    v_existing public.kasa_credit_payments%ROWTYPE;
    v_payment public.kasa_credit_payments%ROWTYPE;
    v_kasa_open_credit_total BIGINT;
    v_legacy_credit_kurus BIGINT;
    v_legacy_alloc BIGINT;
    v_remaining_payment BIGINT;
    v_sale_rec RECORD;
    v_allocate_amt BIGINT;
    v_allocate_cost BIGINT;
    v_trans_code TEXT;
    v_new_balance NUMERIC;
    v_bank_transfer_amt BIGINT;
    v_clean_ref TEXT;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    -- Kronolojik gün ve açık gün kilidi
    v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

    SELECT * INTO v_customer FROM public.credit_customers WHERE id = p_credit_customer_id;
    IF v_customer.id IS NULL OR v_customer.status <> 'active' THEN
        RAISE EXCEPTION 'GEÇERSİZ_MÜŞTERİ: Cari müşteri bulunamadı veya hesabı aktif değil.';
    END IF;

    SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = p_credit_customer_id FOR UPDATE;
    IF v_account.id IS NULL OR v_account.status <> 'active' THEN
        RAISE EXCEPTION 'GEÇERSİZ_HESAP: Müşterinin aktif cari hesabı bulunmamaktadır.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Tahsilat tutarı 0 veya negatif olamaz.';
    END IF;

    -- TAHSİLAT ÖDEME MATEMATİĞİ VE PARÇA UYUMLULUK KONTROLÜ
    IF COALESCE(p_cash_paid_kurus, 0) < 0 OR COALESCE(p_card_paid_kurus, 0) < 0 OR COALESCE(p_bank_transfer_paid_kurus, 0) < 0 OR COALESCE(p_usd_tl_equivalent_kurus, 0) < 0 OR COALESCE(p_eur_tl_equivalent_kurus, 0) < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Ödeme tutarları negatif olamaz.';
    END IF;

    IF p_amount_kurus <> (COALESCE(p_cash_paid_kurus, 0) + COALESCE(p_card_paid_kurus, 0) + COALESCE(p_bank_transfer_paid_kurus, 0) + COALESCE(p_usd_tl_equivalent_kurus, 0) + COALESCE(p_eur_tl_equivalent_kurus, 0)) THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Tahsilat tutarı ödeme parçalarının toplamına eşit olmalıdır.';
    END IF;

    IF (p_payment_method = 'cash' AND (p_cash_paid_kurus <> p_amount_kurus OR p_card_paid_kurus <> 0 OR p_bank_transfer_paid_kurus <> 0 OR p_usd_tl_equivalent_kurus <> 0 OR p_eur_tl_equivalent_kurus <> 0)) OR
       (p_payment_method = 'card' AND (p_card_paid_kurus <> p_amount_kurus OR p_cash_paid_kurus <> 0 OR p_bank_transfer_paid_kurus <> 0 OR p_usd_tl_equivalent_kurus <> 0 OR p_eur_tl_equivalent_kurus <> 0)) OR
       (p_payment_method = 'bank_transfer' AND (p_bank_transfer_paid_kurus <> p_amount_kurus OR p_cash_paid_kurus <> 0 OR p_card_paid_kurus <> 0 OR p_usd_tl_equivalent_kurus <> 0 OR p_eur_tl_equivalent_kurus <> 0)) OR
       (p_payment_method = 'usd' AND (p_usd_tl_equivalent_kurus <> p_amount_kurus OR p_cash_paid_kurus <> 0 OR p_card_paid_kurus <> 0 OR p_bank_transfer_paid_kurus <> 0 OR p_eur_tl_equivalent_kurus <> 0)) OR
       (p_payment_method = 'eur' AND (p_eur_tl_equivalent_kurus <> p_amount_kurus OR p_cash_paid_kurus <> 0 OR p_card_paid_kurus <> 0 OR p_bank_transfer_paid_kurus <> 0 OR p_usd_tl_equivalent_kurus <> 0))
    THEN
        RAISE EXCEPTION 'GEÇERSİZ_ÖDEME: Seçilen ödeme yöntemi (%) ile ödeme tutarları uyumsuzdur.', p_payment_method;
    END IF;

    -- FAZLA TAHSİLAT ENGELİ
    IF p_amount_kurus > ROUND(v_account.current_balance * 100) THEN
        RAISE EXCEPTION 'FAZLA_TAHSİLAT_ENGELİ: Tahsilat tutarı (% TL), müşterinin toplam açık cari borcundan (% TL) büyük olamaz.', (p_amount_kurus / 100.0), v_account.current_balance;
    END IF;

    v_bank_transfer_amt := COALESCE(p_bank_transfer_paid_kurus, 0);
    v_clean_ref := NULLIF(trim(p_bank_transfer_reference), '');
    IF v_clean_ref IS NOT NULL AND length(v_clean_ref) > 200 THEN
        RAISE EXCEPTION 'GEÇERSİZ_REFERANS: Referans Numarası en fazla 200 karakter olabilir.';
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_credit_payments WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            IF v_existing.created_by_user_id IS DISTINCT FROM p_actor_user_id OR
               v_existing.credit_customer_id IS DISTINCT FROM p_credit_customer_id OR
               v_existing.amount_kurus IS DISTINCT FROM p_amount_kurus OR
               v_existing.payment_method IS DISTINCT FROM p_payment_method OR
               v_existing.cash_paid_kurus IS DISTINCT FROM COALESCE(p_cash_paid_kurus, 0) OR
               v_existing.card_paid_kurus IS DISTINCT FROM COALESCE(p_card_paid_kurus, 0) OR
               v_existing.bank_transfer_paid_kurus IS DISTINCT FROM v_bank_transfer_amt OR
               v_existing.usd_paid_cents IS DISTINCT FROM COALESCE(p_usd_paid_cents, 0) OR
               v_existing.eur_paid_cents IS DISTINCT FROM COALESCE(p_eur_paid_cents, 0)
            THEN
                RAISE EXCEPTION 'GEÇERSİZ_İDEMPOTENCY: Aynı idempotency key ile farklı tahsilat isteği gönderilemez.';
            END IF;
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    -- 1. Tahsilat Kaydını Oluştur
    INSERT INTO public.kasa_credit_payments (
        kasa_day_id, credit_customer_id, credit_account_id, amount_kurus, payment_method,
        cash_paid_kurus, card_paid_kurus, usd_paid_cents, usd_rate, usd_tl_equivalent_kurus,
        eur_paid_cents, eur_rate, eur_tl_equivalent_kurus, description, created_by_user_id, idempotency_key,
        bank_transfer_paid_kurus, bank_transfer_reference
    ) VALUES (
        p_kasa_day_id, p_credit_customer_id, v_account.id, p_amount_kurus, p_payment_method,
        COALESCE(p_cash_paid_kurus, 0), COALESCE(p_card_paid_kurus, 0), COALESCE(p_usd_paid_cents, 0), p_usd_rate, COALESCE(p_usd_tl_equivalent_kurus, 0),
        COALESCE(p_eur_paid_cents, 0), p_eur_rate, COALESCE(p_eur_tl_equivalent_kurus, 0), p_description, p_actor_user_id, p_idempotency_key,
        v_bank_transfer_amt, v_clean_ref
    ) RETURNING * INTO v_payment;

    -- 2. Kasa Hareket Kaydı Oluştur
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'credit_tahsilat', p_amount_kurus, COALESCE(p_cash_paid_kurus, 0), COALESCE(p_card_paid_kurus, 0), v_bank_transfer_amt,
        'Cari Tahsilat (' || v_customer.full_name || '): ' || COALESCE(p_description, 'Borç Tahsilatı'), p_actor_user_id
    );

    -- 3. Cari Hesap Bakiyesini Güncelle
    v_new_balance := GREATEST(v_account.current_balance - (p_amount_kurus / 100.0), 0);
    UPDATE public.credit_accounts
    SET current_balance = v_new_balance,
        updated_at = now()
    WHERE id = v_account.id;

    v_trans_code := 'TAH-KASA-' || to_char(v_day.date_val, 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

    INSERT INTO public.credit_transactions (
        transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
        amount, description, source_type, source_reference, admin_username, balance_after
    ) VALUES (
        v_trans_code, p_credit_customer_id, v_account.id, 'payment', 'credit',
        (p_amount_kurus / 100.0), 'Kasa Cari Tahsilatı: ' || COALESCE(p_description, p_payment_method),
        'kasa_payment', v_payment.id::text, v_actor.username, v_new_balance
    );

    -- 4. FIFO Açık Kasa Satışlarını Kapat
    SELECT COALESCE(SUM(uncollected_credit_kurus), 0) INTO v_kasa_open_credit_total
    FROM public.kasa_sales
    WHERE credit_customer_id = p_credit_customer_id AND status = 'completed' AND uncollected_credit_kurus > 0;

    v_legacy_credit_kurus := ROUND(v_account.current_balance * 100) - v_kasa_open_credit_total;
    IF v_legacy_credit_kurus < 0 THEN
        v_legacy_credit_kurus := 0;
    END IF;

    IF v_legacy_credit_kurus > 0 THEN
        v_legacy_alloc := LEAST(p_amount_kurus, v_legacy_credit_kurus);
        v_remaining_payment := p_amount_kurus - v_legacy_alloc;
    ELSE
        v_remaining_payment := p_amount_kurus;
    END IF;

    IF v_remaining_payment > 0 THEN
        FOR v_sale_rec IN
            SELECT id, uncollected_credit_kurus, uncollected_cost_kurus
            FROM public.kasa_sales
            WHERE credit_customer_id = p_credit_customer_id AND status = 'completed' AND uncollected_credit_kurus > 0
            ORDER BY created_at ASC
            FOR UPDATE
        LOOP
            IF v_remaining_payment <= 0 THEN
                EXIT;
            END IF;

            v_allocate_amt := LEAST(v_remaining_payment, v_sale_rec.uncollected_credit_kurus);
            v_allocate_cost := LEAST(v_allocate_amt, v_sale_rec.uncollected_cost_kurus);

            UPDATE public.kasa_sales
            SET uncollected_credit_kurus = uncollected_credit_kurus - v_allocate_amt,
                uncollected_cost_kurus = uncollected_cost_kurus - v_allocate_cost
            WHERE id = v_sale_rec.id;

            v_remaining_payment := v_remaining_payment - v_allocate_amt;
        END LOOP;
    END IF;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'cari_tahsilat_alindi', 'kasa_credit_payments', v_payment.id,
        jsonb_build_object('amount_kurus', p_amount_kurus, 'payment_method', p_payment_method, 'customer_id', p_credit_customer_id, 'bank_transfer_paid_kurus', v_bank_transfer_amt)
    );

    RETURN to_jsonb(v_payment);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

-- 15-Parametreli Uyumluluk Wrapper'ı (Canlı Default Sözleşmesi Korunarak)
CREATE OR REPLACE FUNCTION public.fn_kasa_collect_credit_payment(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_credit_customer_id UUID,
    p_amount_kurus BIGINT,
    p_payment_method TEXT,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL::numeric,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL::numeric,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL::text,
    p_idempotency_key TEXT DEFAULT NULL::text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_kasa_collect_credit_payment(
        p_actor_user_id := p_actor_user_id,
        p_kasa_day_id := p_kasa_day_id,
        p_credit_customer_id := p_credit_customer_id,
        p_amount_kurus := p_amount_kurus,
        p_payment_method := p_payment_method,
        p_cash_paid_kurus := p_cash_paid_kurus,
        p_card_paid_kurus := p_card_paid_kurus,
        p_usd_paid_cents := p_usd_paid_cents,
        p_usd_rate := p_usd_rate,
        p_usd_tl_equivalent_kurus := p_usd_tl_equivalent_kurus,
        p_eur_paid_cents := p_eur_paid_cents,
        p_eur_rate := p_eur_rate,
        p_eur_tl_equivalent_kurus := p_eur_tl_equivalent_kurus,
        p_description := p_description,
        p_idempotency_key := p_idempotency_key,
        p_bank_transfer_paid_kurus := 0::bigint,
        p_bank_transfer_reference := NULL::text
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 6. FN_KASA_DEPOSIT_TO_BANK KRONOLOJİK GÜN KORUMASI ENTEGRASYONU
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_deposit_to_bank(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_amount_kurus BIGINT,
    p_bank_name TEXT,
    p_reference_no TEXT,
    p_description TEXT,
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
    v_current_cash BIGINT := 0;
    v_deposit public.kasa_bank_deposits%ROWTYPE;
    v_existing public.kasa_bank_deposits%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;
    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Bankaya nakit yatırma işlemi yalnızca yöneticilere aittir.';
    END IF;
    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Yatırılacak tutar 0 veya negatif olamaz.';
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_bank_deposits WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    -- Kronolojik gün ve açık gün kilidi
    v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

    v_current_cash := public.fn_kasa_get_physical_cash(p_kasa_day_id);

    IF v_current_cash < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasada bankaya çıkılacak yeterli fiziki TL nakit yok (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    INSERT INTO public.kasa_bank_deposits (
        kasa_day_id, amount_kurus, bank_name, reference_no, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, p_amount_kurus, p_bank_name, p_reference_no, COALESCE(p_description, 'Bankaya Yatırılan Nakit'), p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_deposit;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'bank_deposit', -p_amount_kurus, -p_amount_kurus, 0,
        'Bankaya Yatırılan Nakit (' || COALESCE(p_bank_name, 'Banka') || ')', p_actor_user_id
    );

    RETURN to_jsonb(v_deposit);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_deposit_to_bank(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_deposit_to_bank(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 7. FN_KASA_INJECT_CAPITAL KRONOLOJİK GÜN KORUMASI ENTEGRASYONU
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_inject_capital(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_amount_kurus BIGINT,
    p_description TEXT DEFAULT NULL::text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;
    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Kasaya sermaye girişi yalnızca yöneticilere açıktır.';
    END IF;
    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Sermaye tutarı 0 TL den büyük olmalıdır.';
    END IF;

    -- Kronolojik gün ve açık gün kilidi
    v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

    UPDATE public.kasa_days
    SET capital_injected_kurus = capital_injected_kurus + p_amount_kurus
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'capital_injection', p_amount_kurus, p_amount_kurus, 0,
        COALESCE(p_description, 'İşletme Sermayesi Girişi'), p_actor_user_id
    );

    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_inject_capital(UUID, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_inject_capital(UUID, UUID, BIGINT, TEXT) TO service_role;

-- ============================================================================
-- 8. KAPSAMLI VERİ VE DEVİR ONARIMI (FAIL-CLOSED DO BLOCK)
-- ============================================================================
DO $$
DECLARE
    v_day_aug public.kasa_days%ROWTYPE;
    v_day_sep public.kasa_days%ROWTYPE;
    v_sale_rec RECORD;
    v_open_mov_count INT;
    v_open_mov_amount BIGINT;
    v_validated_count INT := 0;
    v_system_user_id UUID;
    
    -- Exact 15 Sales Definition Table
    v_exp_rec RECORD;
BEGIN
    -- 1. Kasa günlerini FOR UPDATE ile kilitle ve exact başlangıç değerlerini doğrula
    SELECT * INTO v_day_aug FROM public.kasa_days
    WHERE id = '52126414-3835-4277-8d83-be73284a7745'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ONARIM_HATASI: 2026-08-31 kasa günü bulunamadı.';
    END IF;

    IF v_day_aug.status <> 'closed' OR
       v_day_aug.opening_balance_kurus <> 1007000 OR
       v_day_aug.expected_cash_kurus <> 1413000 OR
       v_day_aug.counted_cash_kurus <> 1413000 OR
       v_day_aug.cash_difference_kurus <> 0 OR
       v_day_aug.closed_at <> '2026-09-01 15:16:05.269309+00'::timestamptz
    THEN
        RAISE EXCEPTION 'ONARIM_HATASI: 2026-08-31 kasa günü başlangıç değerleri veya timestamp beklenenle eşleşmiyor.';
    END IF;

    SELECT * INTO v_day_sep FROM public.kasa_days
    WHERE id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ONARIM_HATASI: 2026-09-01 kasa günü bulunamadı.';
    END IF;

    IF v_day_sep.status <> 'open' OR
       v_day_sep.opening_balance_kurus <> 1413000 OR
       v_day_sep.opened_at <> '2026-09-01 15:16:06.215524+00'::timestamptz
    THEN
        RAISE EXCEPTION 'ONARIM_HATASI: 2026-09-01 kasa günü başlangıç değerleri veya timestamp beklenenle eşleşmiyor.';
    END IF;

    -- 1 Eylül açılış hareketi doğrulaması
    SELECT COUNT(*), COALESCE(SUM(amount_kurus), 0)
    INTO v_open_mov_count, v_open_mov_amount
    FROM public.kasa_movements
    WHERE kasa_day_id = v_day_sep.id AND movement_type = 'acilis_bakiyesi';

    IF v_open_mov_count <> 1 OR v_open_mov_amount <> 1413000 THEN
        RAISE EXCEPTION 'ONARIM_HATASI: 1 Eylül açılış hareketinin başlangıç durumu (1 adet, 1413000 kuruş) doğrulanamadı.';
    END IF;

    -- 2. 15 Satışın tamamını FOR UPDATE kilitle ve exact preflight değerleriyle doğrula
    FOR v_exp_rec IN
        SELECT * FROM (
            VALUES
            ('7529de8e-41d8-4881-8bb7-7481a2ec756e'::uuid, 'FS-20260831-00042', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 18000::bigint, 18000::bigint, 0::bigint, 0::bigint),
            ('b30856ff-e4b5-4f1d-847e-c8677d614bd2'::uuid, 'FS-20260831-00043', 'Aksesuar', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 35000::bigint, 35000::bigint, 0::bigint, 0::bigint),
            ('79eaf836-ebac-47a2-8d93-2b99c2aa3508'::uuid, 'FS-20260831-00044', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 9000::bigint, 9000::bigint, 0::bigint, 0::bigint),
            ('846e97d8-9e50-4aac-ac05-75170d2433cb'::uuid, 'FS-20260831-00045', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 22000::bigint, 22000::bigint, 0::bigint, 0::bigint),
            ('3d5a4441-f739-4b71-8c28-98cb0b2544cc'::uuid, 'FS-20260831-00046', 'Fotokopi', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 2000::bigint, 2000::bigint, 0::bigint, 0::bigint),
            ('9dbccf6c-3a00-4a79-9c8a-fd2da5c92a96'::uuid, 'FS-20260831-00047', 'Teknik Servis', '52126414-3835-4277-8d83-be73284a7745'::uuid, '2026-09-01'::date, 380000::bigint, 380000::bigint, 0::bigint, 0::bigint),
            ('bf8f64b3-a54a-4a33-99e7-4b54e8e4cc1f'::uuid, 'FS-20260901-00048', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 500::bigint, 500::bigint, 0::bigint, 0::bigint),
            ('fc688eb3-0cc3-491f-be9e-ae2048b60589'::uuid, 'FS-20260901-00049', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 30000::bigint, 30000::bigint, 0::bigint, 0::bigint),
            ('c7ac9307-cfef-4078-a95a-1b6ba8119903'::uuid, 'FS-20260901-00050', 'Aksesuar', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 40000::bigint, 40000::bigint, 0::bigint, 0::bigint),
            ('a71b06a1-f433-42cb-a4bc-abad01451eb3'::uuid, 'FS-20260901-00051', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 50000::bigint, 50000::bigint, 0::bigint, 0::bigint),
            ('092f4006-5e65-460f-b364-542a30df06e8'::uuid, 'FS-20260901-00052', 'Fotokopi', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 5000::bigint, 5000::bigint, 0::bigint, 0::bigint),
            ('f191072f-3331-4be7-9f33-6f61be6ce42e'::uuid, 'FS-20260901-00055', 'Teknik Servis', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 350000::bigint, 350000::bigint, 0::bigint, 0::bigint),
            ('151a2d9e-6cc9-4b2d-85de-3fbb03a30dec'::uuid, 'FS-20260901-00057', 'Teknik Servis', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 410500::bigint, 0::bigint, 410500::bigint, 0::bigint),
            ('ff8563c7-922e-4921-befc-89e60a0725e9'::uuid, 'FS-20260901-00058', 'Aksesuar', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 30000::bigint, 30000::bigint, 0::bigint, 0::bigint),
            ('4e9f04af-5822-4996-aa5e-ca72acc211af'::uuid, 'FS-20260901-00059', 'Aksesuar', 'cdf1e244-c0e8-4fb5-8f52-14302627257a'::uuid, '2026-09-01'::date, 40000::bigint, 0::bigint, 40000::bigint, 0::bigint)
        ) AS t(sale_id, receipt_no, product_name, expected_kasa_day_id, expected_istanbul_date, expected_total_kurus, expected_cash_kurus, expected_card_kurus, expected_bank_kurus)
    LOOP
        SELECT * INTO v_sale_rec FROM public.kasa_sales WHERE id = v_exp_rec.sale_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ONARIM_DOGRULAMA_HATASI: Satış kaydı bulunamadı: %', v_exp_rec.sale_id;
        END IF;

        IF v_sale_rec.receipt_no <> v_exp_rec.receipt_no OR
           v_sale_rec.product_name <> v_exp_rec.product_name OR
           v_sale_rec.kasa_day_id <> v_exp_rec.expected_kasa_day_id OR
           (v_sale_rec.created_at AT TIME ZONE 'Europe/Istanbul')::date <> v_exp_rec.expected_istanbul_date OR
           v_sale_rec.total_price_kurus <> v_exp_rec.expected_total_kurus OR
           v_sale_rec.cash_paid_kurus <> v_exp_rec.expected_cash_kurus OR
           v_sale_rec.card_paid_kurus <> v_exp_rec.expected_card_kurus OR
           v_sale_rec.bank_transfer_paid_kurus <> v_exp_rec.expected_bank_kurus OR
           v_sale_rec.status <> 'completed'
        THEN
            RAISE EXCEPTION 'ONARIM_DOGRULAMA_HATASI: Satış alanları beklenen değerlerle uyuşmuyor: % (%)', v_exp_rec.sale_id, v_exp_rec.receipt_no;
        END IF;

        -- Önceden oluşturulmuş satis hareketi olmamalı
        IF EXISTS (SELECT 1 FROM public.kasa_movements WHERE sale_id = v_exp_rec.sale_id AND movement_type = 'satis') THEN
            RAISE EXCEPTION 'ONARIM_DOGRULAMA_HATASI: Satış için önceden oluşturulmuş satis hareketi bulundu: %', v_exp_rec.sale_id;
        END IF;

        v_validated_count := v_validated_count + 1;
    END LOOP;

    IF v_validated_count <> 15 THEN
        RAISE EXCEPTION 'ONARIM_DOGRULAMA_HATASI: 15 hedef satışın tamamı doğrulanamadı (Doğrulanan: %).', v_validated_count;
    END IF;

    -- Sistem kullanıcısını belirle
    SELECT id INTO v_system_user_id FROM public.kasa_users WHERE role = 'yonetici' AND is_active = true ORDER BY created_at ASC LIMIT 1;
    IF v_system_user_id IS NULL THEN
        SELECT created_by_user_id INTO v_system_user_id FROM public.kasa_days WHERE id = 'cdf1e244-c0e8-4fb5-8f52-14302627257a';
    END IF;

    -- 3. 31 Ağustos Kasa Günü Kapanış Değerlerini Düzelt (1413000 -> 947000)
    UPDATE public.kasa_days SET
        expected_cash_kurus = 947000,
        counted_cash_kurus = 947000,
        cash_difference_kurus = 0
    WHERE id = v_day_aug.id;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        v_system_user_id,
        'kasa_gunu_devir_onarimi',
        'kasa_days',
        v_day_aug.id,
        jsonb_build_object(
            'date_val', '2026-08-31',
            'reason', 'V11 sistem onarımı: 31 Ağustos kapanışının yanlış bağlanan 1 Eylül satışlarından (4660 TL) arındırılarak gerçek kapanış tutarına (9470 TL) getirilmesi',
            'old_expected_cash_kurus', 1413000,
            'new_expected_cash_kurus', 947000,
            'old_counted_cash_kurus', 1413000,
            'new_counted_cash_kurus', 947000
        )
    );

    -- 4. 1 Eylül Kasa Günü Açılış Bakiyesini Düzelt (1413000 -> 947000)
    UPDATE public.kasa_days SET
        opening_balance_kurus = 947000
    WHERE id = v_day_sep.id;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        v_system_user_id,
        'kasa_gunu_acilis_onarimi',
        'kasa_days',
        v_day_sep.id,
        jsonb_build_object(
            'date_val', '2026-09-01',
            'reason', 'V11 sistem onarımı: 1 Eylül açılış bakiyesinin 31 Ağustos gerçek devir tutarına (9470 TL) eşitlenmesi',
            'old_opening_balance_kurus', 1413000,
            'new_opening_balance_kurus', 947000
        )
    );

    -- 5. 1 Eylül Açılış Movement Kaydını 947000 Kuruşa Güncelle
    UPDATE public.kasa_movements
    SET amount_kurus = 947000,
        cash_portion_kurus = 947000
    WHERE kasa_day_id = v_day_sep.id
      AND movement_type = 'acilis_bakiyesi';

    -- 6. Yanlış Güne (31 Ağustos) Bağlanan 6 Satışın Gününü 1 Eylül'e Taşı
    FOR v_sale_rec IN
        SELECT * FROM public.kasa_sales
        WHERE id IN (
            '7529de8e-41d8-4881-8bb7-7481a2ec756e',
            'b30856ff-e4b5-4f1d-847e-c8677d614bd2',
            '79eaf836-ebac-47a2-8d93-2b99c2aa3508',
            '846e97d8-9e50-4aac-ac05-75170d2433cb',
            '3d5a4441-f739-4b71-8c28-98cb0b2544cc',
            '9dbccf6c-3a00-4a79-9c8a-fd2da5c92a96'
        )
        FOR UPDATE
    LOOP
        UPDATE public.kasa_sales SET
            kasa_day_id = v_day_sep.id
        WHERE id = v_sale_rec.id;

        INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (
            v_sale_rec.created_by_user_id,
            'satis_gun_tasi_onarimi',
            'kasa_sales',
            v_sale_rec.id,
            jsonb_build_object(
                'receipt_no', v_sale_rec.receipt_no,
                'reason', 'V11 sistem onarımı: 2026-09-01 tarihinde yapılan ancak açık kalan 2026-08-31 gününe bağlanan satışın doğru güne (2026-09-01) taşınması',
                'old_kasa_day_id', v_sale_rec.kasa_day_id,
                'new_kasa_day_id', v_day_sep.id
            )
        );
    END LOOP;

    -- 7. Toplam 15 Satış İçin Canonical 'satis' Movement Kayıtlarını Oluştur
    FOR v_sale_rec IN
        SELECT * FROM public.kasa_sales
        WHERE id IN (
            '7529de8e-41d8-4881-8bb7-7481a2ec756e',
            'b30856ff-e4b5-4f1d-847e-c8677d614bd2',
            '79eaf836-ebac-47a2-8d93-2b99c2aa3508',
            '846e97d8-9e50-4aac-ac05-75170d2433cb',
            '3d5a4441-f739-4b71-8c28-98cb0b2544cc',
            '9dbccf6c-3a00-4a79-9c8a-fd2da5c92a96',
            'bf8f64b3-a54a-4a33-99e7-4b54e8e4cc1f',
            'fc688eb3-0cc3-491f-be9e-ae2048b60589',
            'c7ac9307-cfef-4078-a95a-1b6ba8119903',
            'a71b06a1-f433-42cb-a4bc-abad01451eb3',
            '092f4006-5e65-460f-b364-542a30df06e8',
            'f191072f-3331-4be7-9f33-6f61be6ce42e',
            '151a2d9e-6cc9-4b2d-85de-3fbb03a30dec',
            'ff8563c7-922e-4921-befc-89e60a0725e9',
            '4e9f04af-5822-4996-aa5e-ca72acc211af'
        )
        FOR UPDATE
    LOOP
        INSERT INTO public.kasa_movements (
            kasa_day_id,
            movement_type,
            sale_id,
            amount_kurus,
            cash_portion_kurus,
            card_portion_kurus,
            bank_transfer_portion_kurus,
            description,
            created_by_user_id,
            created_at
        ) VALUES (
            v_day_sep.id,
            'satis',
            v_sale_rec.id,
            v_sale_rec.total_price_kurus,
            COALESCE(v_sale_rec.cash_paid_kurus, 0),
            COALESCE(v_sale_rec.card_paid_kurus, 0),
            COALESCE(v_sale_rec.bank_transfer_paid_kurus, 0),
            'Satış (' || v_sale_rec.receipt_no || '): ' || TRIM(v_sale_rec.product_name),
            v_sale_rec.created_by_user_id,
            v_sale_rec.created_at
        );

        INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (
            v_sale_rec.created_by_user_id,
            'satis_movement_olusturuldu',
            'kasa_movements',
            v_sale_rec.id,
            jsonb_build_object(
                'sale_id', v_sale_rec.id,
                'receipt_no', v_sale_rec.receipt_no,
                'amount_kurus', v_sale_rec.total_price_kurus,
                'cash_portion_kurus', v_sale_rec.cash_paid_kurus,
                'card_portion_kurus', v_sale_rec.card_paid_kurus,
                'reason', 'V11 sistem onarımı: V7-V10 create_sale fonksiyonunda eksik kalan satis movement kaydının kanonik olarak oluşturulması'
            )
        );
    END LOOP;

END $$;

COMMIT;
