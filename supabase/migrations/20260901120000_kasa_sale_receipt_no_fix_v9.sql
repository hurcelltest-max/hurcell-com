-- ============================================================================
-- Migration: 20260901120000_kasa_sale_receipt_no_fix_v9.sql
-- Description: Surgical receipt_no restoration directly on V7 fn_kasa_create_sale
--              Preserves 100% of V7 business logic, error handling,
--              validations, TS costs, bank transactions, and idempotency contract.
-- Security: SECURITY DEFINER, SET search_path = public, pg_temp, REVOKE ALL,
--           GRANT TO service_role only.
-- ============================================================================

BEGIN;

-- 1. SEQUENCE GÜVENCESİ
CREATE SEQUENCE IF NOT EXISTS public.kasa_receipt_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- 2. SEQUENCE SAYACINI MEVCUT EN YÜKSEK SATIŞ FİŞ NUMARASINA GÜVENLE HİZALA
DO $$
DECLARE
    v_max_id BIGINT := 0;
    v_curr_val BIGINT := 0;
BEGIN
    SELECT COALESCE(MAX(
        CASE 
            WHEN receipt_no ~ '^FS-[0-9]{8}-([0-9]+)$' THEN 
                CAST(SUBSTRING(receipt_no FROM '^FS-[0-9]{8}-([0-9]+)$') AS BIGINT)
            ELSE 0
        END
    ), 0) INTO v_max_id FROM public.kasa_sales;

    SELECT COALESCE(last_value, 1) INTO v_curr_val 
    FROM pg_sequences 
    WHERE schemaname = 'public' AND sequencename = 'kasa_receipt_seq';

    IF v_max_id >= v_curr_val THEN
        PERFORM setval('public.kasa_receipt_seq', v_max_id, true);
    END IF;
END $$;

-- 3. V7 PRODUCTION FONKSİYONUNA CERRAHİ RECEIPT_NO ENTEGRASYONU
CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT DEFAULT NULL,
    p_service_cost_kurus BIGINT DEFAULT NULL,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_reference TEXT DEFAULT NULL,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_credit_customer_id UUID DEFAULT NULL,
    p_credit_paid_kurus BIGINT DEFAULT 0,
    p_uncollected_credit_kurus BIGINT DEFAULT 0,
    p_uncollected_cost_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_serial_imei TEXT DEFAULT NULL,
    p_technical_service_details JSONB DEFAULT NULL,
    p_service_cost_payment_status TEXT DEFAULT NULL,
    p_service_cost_payment_source TEXT DEFAULT NULL,
    p_service_cost_bank_account_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_day_rec RECORD;
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
    SELECT * INTO v_day_rec FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF NOT FOUND OR v_day_rec.status != 'open' THEN
        RAISE EXCEPTION 'KASA_GÜNÜ_KAPALI: Satış işlemi yalnızca açık kasa gününden yapılabilir.';
    END IF;

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

    v_seq_val := nextval('public.kasa_receipt_seq');
    v_receipt_no := 'FS-' || to_char(v_day_rec.date_val, 'YYYYMMDD') || '-' || lpad(v_seq_val::text, 5, '0');

    INSERT INTO public.kasa_sales (
        receipt_no,
        kasa_day_id, category_id, quantity, unit_price_kurus, total_price_kurus,
        cost_price_kurus, service_cost_kurus, cash_paid_kurus, card_paid_kurus,
        bank_transfer_paid_kurus, bank_transfer_reference, usd_paid_cents, usd_rate,
        usd_tl_equivalent_kurus, eur_paid_cents, eur_rate, eur_tl_equivalent_kurus,
        credit_customer_id, credit_paid_kurus, uncollected_credit_kurus, uncollected_cost_kurus,
        description, customer_name, customer_phone, serial_imei, technical_service_details,
        service_cost_payment_status, service_cost_payment_source, service_cost_bank_account_id,
        service_cost_paid_at, service_cost_paid_by_user_id, status, created_by_user_id
    ) VALUES (
        v_receipt_no,
        p_kasa_day_id, p_category_id, p_quantity, p_unit_price_kurus, p_total_price_kurus,
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

    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_bank' THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, related_sale_id, created_by_user_id
        ) VALUES (
            p_service_cost_bank_account_id, 'ts_cost_payment', 'out', p_service_cost_kurus, v_day_rec.date_val,
            'Teknik Servis Maliyet Ödemesi (Satış Anında)', v_sale_id, p_actor_user_id
        ) RETURNING id INTO v_bank_tx_id;

        PERFORM public.fn_kasa_recalculate_bank_balance(p_service_cost_bank_account_id);
    END IF;

    v_res := jsonb_build_object('success', true, 'sale_id', v_sale_id, 'receipt_no', v_receipt_no, 'bank_transaction_id', v_bank_tx_id);

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'create_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

-- 4. GÜVENLİK YETKİLENDİRMESİ (ACL HARDENING)
REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON SEQUENCE public.kasa_receipt_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kasa_receipt_seq TO service_role;

COMMIT;
