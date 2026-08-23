-- Migration: 20260823225000_kasa_add_bank_transfer_payment.sql
-- Description: HurCELL Kasa Föyü Havale / EFT Ödeme Desteği, Kolon Güncellemeleri, Kısıtlamalar, Gerçekleşmiş Kâr/Fiziki Kasadan Bağımsız İzleme ve Backward Compatible RPC Overload'ları

BEGIN;

-- 1. PRECONDITION CHECKS
DO $$
BEGIN
  IF to_regclass('public.kasa_sales') IS NULL THEN
    RAISE EXCEPTION 'public.kasa_sales table does not exist; foundation migration must run first';
  END IF;
  IF to_regclass('public.kasa_credit_payments') IS NULL THEN
    RAISE EXCEPTION 'public.kasa_credit_payments table does not exist; credit migration must run first';
  END IF;
END $$;

-- 2. TABLO KOLON GÜNCELLEMELERİ VE KISITLAMALAR

-- A. kasa_movements tablosuna bank_transfer_portion_kurus eklenmesi
ALTER TABLE public.kasa_movements ADD COLUMN IF NOT EXISTS bank_transfer_portion_kurus BIGINT NOT NULL DEFAULT 0;

-- B. kasa_sales tablosuna bank_transfer_paid_kurus ve bank_transfer_reference eklenmesi
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS bank_transfer_paid_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_bank_transfer_paid CHECK (bank_transfer_paid_kurus >= 0);
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS bank_transfer_reference TEXT;

-- Kasa Satış Ödeme Hesabı Kısıtlamasını Güncelle
ALTER TABLE public.kasa_sales DROP CONSTRAINT IF EXISTS chk_kasa_sales_payment_math;
ALTER TABLE public.kasa_sales ADD CONSTRAINT chk_kasa_sales_payment_math CHECK (
    total_price_kurus = (cash_paid_kurus + card_paid_kurus + bank_transfer_paid_kurus + usd_tl_equivalent_kurus + eur_tl_equivalent_kurus + credit_paid_kurus)
);

CREATE INDEX IF NOT EXISTS idx_kasa_sales_bank_transfer ON public.kasa_sales(bank_transfer_paid_kurus) WHERE bank_transfer_paid_kurus > 0;

-- C. kasa_credit_payments tablosuna bank_transfer_paid_kurus ve bank_transfer_reference eklenmesi
ALTER TABLE public.kasa_credit_payments ADD COLUMN IF NOT EXISTS bank_transfer_paid_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_credit_payments_bank_transfer CHECK (bank_transfer_paid_kurus >= 0);
ALTER TABLE public.kasa_credit_payments ADD COLUMN IF NOT EXISTS bank_transfer_reference TEXT;

-- Cari Tahsilat Yöntemi Kısıtlamasını Güncelle ('bank_transfer' Dâhil)
ALTER TABLE public.kasa_credit_payments DROP CONSTRAINT IF EXISTS chk_kasa_credit_payments_method;
ALTER TABLE public.kasa_credit_payments ADD CONSTRAINT chk_kasa_credit_payments_method CHECK (
    payment_method IN ('cash', 'card', 'bank_transfer', 'usd', 'eur')
);

-- 3. SECURE ATOMIC RPC: SATIŞ OLUŞTURMA (HAVALE / EFT DESTEKLİ GÜNCEL SÜRÜM - 24 PARAMS)
-- NOT: PostgREST PGRST203 belirsizlik hatasını önlemek için 24 parametreli yeni sürümde DEFAULT kullanılmaz.
CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INT,
    p_unit_price_kurus BIGINT,
    p_cost_price_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC(12, 4),
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC(12, 4),
    p_eur_tl_equivalent_kurus BIGINT,
    p_credit_paid_kurus BIGINT,
    p_credit_customer_id UUID,
    p_brand TEXT,
    p_model TEXT,
    p_product_code TEXT,
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
    v_category public.kasa_categories%ROWTYPE;
    v_sale public.kasa_sales%ROWTYPE;
    v_existing public.kasa_sales%ROWTYPE;
    v_customer public.credit_customers%ROWTYPE;
    v_account public.credit_accounts%ROWTYPE;
    v_total_price BIGINT;
    v_uncollected_cost BIGINT := 0;
    v_trans_code TEXT;
    v_new_balance NUMERIC;
    v_source_type TEXT := 'store_sale';
    v_receipt_no TEXT;
    v_clean_ref TEXT;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kasa günü bulunamadı veya kapalı.';
    END IF;

    SELECT * INTO v_category FROM public.kasa_categories WHERE id = p_category_id;
    IF v_category.id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Kategori bulunamadı.';
    END IF;

    IF v_category.name = 'Teknik Servis' THEN
        v_source_type := 'technical_service_fee';
    ELSE
        v_source_type := 'store_sale';
    END IF;

    v_total_price := p_quantity * p_unit_price_kurus;

    -- KARMA ÖDEME KONTROLÜ: NAKİT + KART + HAVALE/EFT + USD + EUR + CARİ = TOPLAM FİYAT
    IF (COALESCE(p_cash_paid_kurus, 0) + COALESCE(p_card_paid_kurus, 0) + COALESCE(p_bank_transfer_paid_kurus, 0) + COALESCE(p_usd_tl_equivalent_kurus, 0) + COALESCE(p_eur_tl_equivalent_kurus, 0) + COALESCE(p_credit_paid_kurus, 0)) <> v_total_price THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Ödeme toplamı satılan ürün toplam fiyatına eşit olmalıdır.';
    END IF;

    v_clean_ref := NULLIF(trim(p_bank_transfer_reference), '');
    IF v_clean_ref IS NOT NULL AND length(v_clean_ref) > 200 THEN
        RAISE EXCEPTION 'GEÇERSİZ_REFERANS: Referans Numarası en fazla 200 karakter olabilir.';
    END IF;

    -- CARİ VERESİYE SATIŞ KONTROLLERİ VE BAKİYE YAZMA
    IF COALESCE(p_credit_paid_kurus, 0) > 0 THEN
        IF p_credit_customer_id IS NULL THEN
            RAISE EXCEPTION 'GEÇERSİZ_MÜŞTERİ: Cari veresiye satış için müşteri seçilmelidir.';
        END IF;

        SELECT * INTO v_customer FROM public.credit_customers WHERE id = p_credit_customer_id;
        IF v_customer.id IS NULL OR v_customer.status <> 'active' THEN
            RAISE EXCEPTION 'GEÇERSİZ_MÜŞTERİ: Seçilen cari müşteri bulunamadı veya hesabı aktif değil.';
        END IF;

        SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = p_credit_customer_id FOR UPDATE;
        IF v_account.id IS NULL OR v_account.status <> 'active' OR v_account.credit_limit <= 0 THEN
            RAISE EXCEPTION 'GEÇERSİZ_HESAP: Müşterinin onaylı aktif cari hesabı veya kullanılabilir limiti bulunmamaktadır.';
        END IF;

        IF p_credit_paid_kurus > ROUND((v_account.credit_limit - v_account.current_balance) * 100) THEN
            RAISE EXCEPTION 'YETERSİZ_LİMİT: Müşterinin kullanılabilir cari limiti (%) veresiye tutarından (% TL) küçüktür.', (v_account.credit_limit - v_account.current_balance), (p_credit_paid_kurus / 100.0);
        END IF;

        IF COALESCE(p_cost_price_kurus, 0) > 0 THEN
            v_uncollected_cost := ROUND((p_credit_paid_kurus::NUMERIC / v_total_price::NUMERIC) * (p_cost_price_kurus * p_quantity));
        END IF;
    END IF;

    -- İDEMPOTENCY SIKI GÜVENLİK VE ALAN KARŞILAŞTIRMA KONTROLÜ
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            IF v_existing.created_by_user_id IS DISTINCT FROM p_actor_user_id OR
               v_existing.kasa_day_id IS DISTINCT FROM p_kasa_day_id OR
               v_existing.category_id IS DISTINCT FROM p_category_id OR
               v_existing.product_name IS DISTINCT FROM p_product_name OR
               v_existing.quantity IS DISTINCT FROM p_quantity OR
               v_existing.unit_price_kurus IS DISTINCT FROM p_unit_price_kurus OR
               v_existing.total_price_kurus IS DISTINCT FROM v_total_price OR
               v_existing.cash_paid_kurus IS DISTINCT FROM COALESCE(p_cash_paid_kurus, 0) OR
               v_existing.card_paid_kurus IS DISTINCT FROM COALESCE(p_card_paid_kurus, 0) OR
               v_existing.bank_transfer_paid_kurus IS DISTINCT FROM COALESCE(p_bank_transfer_paid_kurus, 0) OR
               v_existing.usd_paid_cents IS DISTINCT FROM COALESCE(p_usd_paid_cents, 0) OR
               v_existing.usd_tl_equivalent_kurus IS DISTINCT FROM COALESCE(p_usd_tl_equivalent_kurus, 0) OR
               v_existing.eur_paid_cents IS DISTINCT FROM COALESCE(p_eur_paid_cents, 0) OR
               v_existing.eur_tl_equivalent_kurus IS DISTINCT FROM COALESCE(p_eur_tl_equivalent_kurus, 0) OR
               v_existing.credit_paid_kurus IS DISTINCT FROM COALESCE(p_credit_paid_kurus, 0) OR
               v_existing.credit_customer_id IS DISTINCT FROM p_credit_customer_id
            THEN
                RAISE EXCEPTION 'GEÇERSİZ_İDEMPOTENCY: Aynı idempotency key ile farklı satış isteği gönderilemez.';
            END IF;
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    v_receipt_no := 'FS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.kasa_receipt_seq')::text, 5, '0');

    -- 1. Satış Kaydı Oluştur
    INSERT INTO public.kasa_sales (
        kasa_day_id, category_id, product_name, brand, model, product_code, quantity,
        unit_price_kurus, cost_price_kurus, total_price_kurus, cash_paid_kurus, card_paid_kurus,
        bank_transfer_paid_kurus, bank_transfer_reference,
        usd_paid_cents, usd_rate, usd_tl_equivalent_kurus, eur_paid_cents, eur_rate, eur_tl_equivalent_kurus,
        credit_paid_kurus, uncollected_credit_kurus, uncollected_cost_kurus, credit_customer_id, credit_account_id,
        receipt_no, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, p_category_id, p_product_name, p_brand, p_model, p_product_code, p_quantity,
        p_unit_price_kurus, p_cost_price_kurus, v_total_price, p_cash_paid_kurus, p_card_paid_kurus,
        p_bank_transfer_paid_kurus, v_clean_ref,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus,
        p_credit_paid_kurus, p_credit_paid_kurus, v_uncollected_cost, p_credit_customer_id, v_account.id,
        v_receipt_no, p_description, p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_sale;

    -- 2. Kasa Hareket Kaydı (Havale/EFT Ayrı bank_transfer_portion_kurus İçine Yazılır, Fiziki Nakit Bakiyesini Etkilemez)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'satis', v_sale.id, v_total_price, p_cash_paid_kurus, p_card_paid_kurus, p_bank_transfer_paid_kurus,
        'Satış (' || v_receipt_no || '): ' || p_product_name, p_actor_user_id
    );

    -- 3. Dövizle Ödeme Yapılmışsa Döviz Kasasını Güncelle
    IF p_usd_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            usd_balance_cents = usd_balance_cents + p_usd_paid_cents,
            usd_cost_pool_kurus = usd_cost_pool_kurus + p_usd_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, sale_id, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'USD', p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, v_sale.id, p_actor_user_id
        );
    END IF;

    IF p_eur_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            eur_balance_cents = eur_balance_cents + p_eur_paid_cents,
            eur_cost_pool_kurus = eur_cost_pool_kurus + p_eur_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, sale_id, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'EUR', p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus, v_sale.id, p_actor_user_id
        );
    END IF;

    -- 4. CARİ ÖDEME VARSA MÜŞTERİ BAKİYESİNİ GÜNCELLE VE LEDGER'A YAZ
    IF p_credit_paid_kurus > 0 THEN
        v_new_balance := v_account.current_balance + (p_credit_paid_kurus / 100.0);
        UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = v_account.id;

        v_trans_code := 'PUR-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

        INSERT INTO public.credit_transactions (
            transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
            amount, description, source_type, source_reference, admin_username, balance_after
        ) VALUES (
            v_trans_code, p_credit_customer_id, v_account.id, 'purchase', 'debit',
            (p_credit_paid_kurus / 100.0), 'Kasa İçi Veresiye Satış: ' || p_product_name || ' (' || v_receipt_no || ')',
            v_source_type, v_sale.id::text, v_actor.username, v_new_balance
        );
    END IF;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'satis_yapildi', 'kasa_sales', v_sale.id, jsonb_build_object('receipt_no', v_receipt_no, 'total_price_kurus', v_total_price, 'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus));

    RETURN to_jsonb(v_sale);
END;
$$;

-- 4. BACKWARD COMPATIBILITY OVERLOAD: ESKİ CANLI SATIŞ ÇAĞRILARINI DESTEKLEYEN FN_KASA_CREATE_SALE (22 PARAMS)
CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INT,
    p_unit_price_kurus BIGINT,
    p_cost_price_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC,
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC,
    p_eur_tl_equivalent_kurus BIGINT,
    p_credit_paid_kurus BIGINT,
    p_credit_customer_id UUID,
    p_brand TEXT,
    p_model TEXT,
    p_product_code TEXT,
    p_description TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_kasa_create_sale(
        p_actor_user_id, p_kasa_day_id, p_category_id, p_product_name, p_quantity,
        p_unit_price_kurus, p_cost_price_kurus, p_cash_paid_kurus, p_card_paid_kurus,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, p_eur_paid_cents,
        p_eur_rate, p_eur_tl_equivalent_kurus, p_credit_paid_kurus, p_credit_customer_id,
        p_brand, p_model, p_product_code, p_description, p_idempotency_key,
        0, NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 5. SECURE ATOMIC RPC: CARİ TAHSİLAT ALMA (HAVALE / EFT DESTEKLİ GÜNCEL SÜRÜM - 17 PARAMS)
-- NOT: PostgREST PGRST203 belirsizlik hatasını önlemek için 17 parametreli yeni sürümde DEFAULT kullanılmaz.
CREATE OR REPLACE FUNCTION public.fn_kasa_collect_credit_payment(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_credit_customer_id UUID,
    p_amount_kurus BIGINT,
    p_payment_method TEXT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC(12, 4),
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC(12, 4),
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

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kasa günü bulunamadı veya kapalı.';
    END IF;

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

    -- FAZLA TAHSİLAT ENGELİ: KURUŞ BAZINDA TAM KARŞILAŞTIRMA
    IF p_amount_kurus > ROUND(v_account.current_balance * 100) THEN
        RAISE EXCEPTION 'FAZLA_TAHSİLAT_ENGELİ: Tahsilat tutarı (% TL), müşterinin toplam açık cari borcundan (% TL) büyük olamaz.', (p_amount_kurus / 100.0), v_account.current_balance;
    END IF;

    v_bank_transfer_amt := COALESCE(p_bank_transfer_paid_kurus, 0);

    v_clean_ref := NULLIF(trim(p_bank_transfer_reference), '');
    IF v_clean_ref IS NOT NULL AND length(v_clean_ref) > 200 THEN
        RAISE EXCEPTION 'GEÇERSİZ_REFERANS: Referans Numarası en fazla 200 karakter olabilir.';
    END IF;

    -- İDEMPOTENCY SIKI GÜVENLİK VE ALAN KARŞILAŞTIRMA KONTROLÜ
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
        cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus, bank_transfer_reference,
        usd_paid_cents, usd_rate, usd_tl_equivalent_kurus,
        eur_paid_cents, eur_rate, eur_tl_equivalent_kurus, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, p_credit_customer_id, v_account.id, p_amount_kurus, p_payment_method,
        p_cash_paid_kurus, p_card_paid_kurus, v_bank_transfer_amt, v_clean_ref,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus,
        p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus, COALESCE(p_description, 'Cari Borç Tahsilatı'), p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_payment;

    -- 2. Kasa Hareket Kaydı (Havale/EFT Ayrı bank_transfer_portion_kurus İçine Yazılır, Fiziki Nakit Bakiyesini Etkilemez)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'nakit_tahsilat', p_amount_kurus, p_cash_paid_kurus, p_card_paid_kurus, v_bank_transfer_amt,
        'Cari Tahsilat: ' || v_customer.full_name || ' (' || UPPER(p_payment_method) || ')', p_actor_user_id
    );

    -- 3. Dövizle Tahsilat Yapılmışsa Döviz Kasasını Güncelle
    IF p_usd_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            usd_balance_cents = usd_balance_cents + p_usd_paid_cents,
            usd_cost_pool_kurus = usd_cost_pool_kurus + p_usd_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'USD', p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus,
            'Cari Tahsilat (USD): ' || v_customer.full_name, p_actor_user_id
        );
    END IF;

    IF p_eur_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            eur_balance_cents = eur_balance_cents + p_eur_paid_cents,
            eur_cost_pool_kurus = eur_cost_pool_kurus + p_eur_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'EUR', p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus,
            'Cari Tahsilat (EUR): ' || v_customer.full_name, p_actor_user_id
        );
    END IF;

    -- 4. FIFO TAHSİS DAĞITIMI
    v_remaining_payment := p_amount_kurus;

    SELECT COALESCE(SUM(uncollected_credit_kurus), 0) INTO v_kasa_open_credit_total
    FROM public.kasa_sales
    WHERE credit_customer_id = p_credit_customer_id AND status = 'completed' AND uncollected_credit_kurus > 0;

    v_legacy_credit_kurus := GREATEST(ROUND(v_account.current_balance * 100) - v_kasa_open_credit_total, 0);

    IF v_legacy_credit_kurus > 0 THEN
        v_legacy_alloc := LEAST(v_remaining_payment, v_legacy_credit_kurus);

        INSERT INTO public.kasa_credit_payment_allocations (
            credit_payment_id, sale_id, allocated_amount_kurus, allocated_cost_kurus
        ) VALUES (
            v_payment.id, NULL, v_legacy_alloc, 0
        );

        v_remaining_payment := v_remaining_payment - v_legacy_alloc;
    END IF;

    IF v_remaining_payment > 0 THEN
        FOR v_sale_rec IN
            SELECT id, uncollected_credit_kurus, uncollected_cost_kurus, credit_paid_kurus, cost_price_kurus, quantity
            FROM public.kasa_sales
            WHERE credit_customer_id = p_credit_customer_id AND status = 'completed' AND uncollected_credit_kurus > 0
            ORDER BY created_at ASC, id ASC
        LOOP
            EXIT WHEN v_remaining_payment <= 0;

            IF v_remaining_payment >= v_sale_rec.uncollected_credit_kurus THEN
                v_allocate_amt := v_sale_rec.uncollected_credit_kurus;
                v_allocate_cost := v_sale_rec.uncollected_cost_kurus;
            ELSE
                v_allocate_amt := v_remaining_payment;
                IF v_sale_rec.credit_paid_kurus > 0 THEN
                    v_allocate_cost := ROUND((v_allocate_amt::NUMERIC / v_sale_rec.credit_paid_kurus::NUMERIC) * COALESCE(v_sale_rec.cost_price_kurus * v_sale_rec.quantity, 0));
                ELSE
                    v_allocate_cost := 0;
                END IF;
            END IF;

            UPDATE public.kasa_sales SET
                uncollected_credit_kurus = uncollected_credit_kurus - v_allocate_amt,
                uncollected_cost_kurus = GREATEST(uncollected_cost_kurus - v_allocate_cost, 0)
            WHERE id = v_sale_rec.id;

            INSERT INTO public.kasa_credit_payment_allocations (
                credit_payment_id, sale_id, allocated_amount_kurus, allocated_cost_kurus
            ) VALUES (
                v_payment.id, v_sale_rec.id, v_allocate_amt, v_allocate_cost
            );

            v_remaining_payment := v_remaining_payment - v_allocate_amt;
        END LOOP;
    END IF;

    -- 5. Müşterinin Cari Hesabını Güncelle ve Credit Ledger'a Yaz ('bank_transfer' Kodu Dahil)
    v_new_balance := GREATEST(v_account.current_balance - (p_amount_kurus / 100.0), 0);
    UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = v_account.id;

    v_trans_code := 'PAY-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

    INSERT INTO public.credit_transactions (
        transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
        amount, description, source_type, source_reference, payment_method, admin_username, balance_after
    ) VALUES (
        v_trans_code, p_credit_customer_id, v_account.id, 'payment', 'credit',
        (p_amount_kurus / 100.0), COALESCE(p_description, 'Kasa İçi Cari Tahsilat'), 'payment', v_payment.id::text,
        CASE
            WHEN p_payment_method = 'cash' THEN 'cash'
            WHEN p_payment_method = 'card' THEN 'card'
            WHEN p_payment_method = 'bank_transfer' THEN 'bank_transfer'
            ELSE 'other'
        END,
        v_actor.username, v_new_balance
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'cari_tahsilat_alindi', 'kasa_credit_payments', v_payment.id, jsonb_build_object('customer_id', p_credit_customer_id, 'amount_kurus', p_amount_kurus, 'payment_method', p_payment_method, 'new_balance', v_new_balance));

    RETURN to_jsonb(v_payment);
END;
$$;

-- 6. BACKWARD COMPATIBILITY OVERLOAD: ESKİ CANLI TAHSİLAT ÇAĞRILARINI DESTEKLEYEN FN_KASA_COLLECT_CREDIT_PAYMENT (15 PARAMS)
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
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_kasa_collect_credit_payment(
        p_actor_user_id, p_kasa_day_id, p_credit_customer_id, p_amount_kurus, p_payment_method,
        p_cash_paid_kurus, p_card_paid_kurus, p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus,
        p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus, p_description, p_idempotency_key,
        CASE WHEN p_payment_method = 'bank_transfer' THEN p_amount_kurus ELSE 0 END, NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT) TO service_role;

-- 7. SECURE ATOMIC RPC: SATIŞ İPTALİ (HAVALE / EFT DESTEKLİ GÜNCEL SÜRÜM)
DROP FUNCTION IF EXISTS public.fn_kasa_cancel_sale(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_sale public.kasa_sales%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_account public.credit_accounts%ROWTYPE;
    v_uncollected_credit BIGINT;
    v_new_balance NUMERIC;
    v_trans_code TEXT;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.role <> 'yonetici' OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Yalnızca yöneticiler satış iptali yapabilir.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: İptal gerekçesi girmek zorunludur.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: İptal edilecek tamamlanmış satış bulunamadı veya zaten iptal edilmiş.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_sale.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Satışın ait olduğu kasa günü açık değil.';
    END IF;

    -- CARİ SATIŞ İPTALİ REVERSAL İŞLEMLERİ
    IF v_sale.credit_customer_id IS NOT NULL AND v_sale.uncollected_credit_kurus > 0 THEN
        SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = v_sale.credit_customer_id FOR UPDATE;
        IF v_account.id IS NOT NULL THEN
            v_uncollected_credit := v_sale.uncollected_credit_kurus;
            v_new_balance := GREATEST(v_account.current_balance - (v_uncollected_credit / 100.0), 0);

            UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = v_account.id;

            v_trans_code := 'REV-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

            INSERT INTO public.credit_transactions (
                transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
                amount, description, source_type, source_reference, admin_username, balance_after
            ) VALUES (
                v_trans_code, v_sale.credit_customer_id, v_account.id, 'reversal', 'credit',
                (v_uncollected_credit / 100.0), 'Kasa Satış İptali: ' || v_sale.receipt_no || ' (Gerekçe: ' || p_justification || ')',
                'reversal', v_sale.id::text, v_actor.username, v_new_balance
            );
        END IF;
    END IF;

    -- Satış Durumunu 'cancelled' Yap
    UPDATE public.kasa_sales SET
        status = 'cancelled',
        description = COALESCE(description, '') || ' [İPTAL GEREKÇESİ: ' || p_justification || ']',
        uncollected_credit_kurus = 0,
        uncollected_cost_kurus = 0
    WHERE id = p_sale_id;

    -- Kasa Hareket Kaydı (İptal - Havale/EFT Tutarı Ayrı Negatif Portion Olarak Düşülür, Fiziki Nakit Düşmez)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'iptal', -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus, -v_sale.bank_transfer_paid_kurus,
        'Satış İptali (' || v_sale.receipt_no || '): ' || p_justification, p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'satis_iptal_edildi', 'kasa_sales', p_sale_id, jsonb_build_object('receipt_no', v_sale.receipt_no, 'justification', p_justification));

    RETURN to_jsonb(v_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT) TO service_role;

COMMIT;
