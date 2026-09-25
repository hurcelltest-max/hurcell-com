-- ============================================================================
-- HURCELL KASA V24 MIGRATION
-- Düzeltme: Normal Satış Kategorilerinde (Fotokopi, Telefon, Aksesuar vb.) 
-- service_cost_payment_status Alanının Kanonik Varsayılanla ('previously_paid_or_stock')
-- Kaydedilmesi ve POS Banka Entegrasyonunun Korunması
-- ============================================================================

BEGIN;

-- 1. RPC: FN_KASA_CREATE_SALE (33 Parametre - POS Banka Destekli Ana Fonksiyon)
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
    p_idempotency_key TEXT DEFAULT NULL::text,
    p_pos_bank_account_id UUID DEFAULT NULL::uuid
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
    v_pos_bank_rec RECORD;
    v_cat_name TEXT;
    v_payload JSONB;
    v_cached JSONB;
    v_sale_id UUID;
    v_bank_tx_id UUID;
    v_pos_tx_id UUID;
    v_receipt_no TEXT;
    v_seq_val BIGINT;
    v_effective_payment_status TEXT;
    v_effective_payment_source TEXT;
    v_effective_bank_account_id UUID;
BEGIN
    IF p_product_name IS NULL OR TRIM(p_product_name) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_ÜRÜN_ADI: Ürün / Hizmet adı zorunludur.';
    END IF;

    -- Kronolojik gün ve açık gün kilidi
    v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

    -- Aktör kullanıcı doğrulaması
    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    -- Kategori Adı
    SELECT name INTO v_cat_name FROM public.kasa_categories WHERE id = p_category_id;

    -- Normal satışlarda ve Teknik Servis dışı kategorilerde service_cost_payment_status varsayılanı 'previously_paid_or_stock'
    IF v_cat_name = 'Teknik Servis' THEN
        v_effective_payment_status := COALESCE(p_service_cost_payment_status, 'previously_paid_or_stock');
        v_effective_payment_source := p_service_cost_payment_source;
        v_effective_bank_account_id := p_service_cost_bank_account_id;

        IF (v_effective_payment_status = 'paid_from_bank' OR v_effective_payment_source = 'bank') THEN
            IF v_actor_role <> 'yonetici' THEN
                RAISE EXCEPTION 'BANKA_ÖDEMESİ_YETKİSİZ: Bankadan maliyet ödemesi yalnız yönetici yetkisindedir.';
            END IF;
        END IF;
    ELSE
        v_effective_payment_status := COALESCE(p_service_cost_payment_status, 'previously_paid_or_stock');
        v_effective_payment_source := NULL;
        v_effective_bank_account_id := NULL;
    END IF;

    -- POS Bankası Kontrolü: Kredi kartı tahsilatı varsa POS bankası zorunludur
    IF COALESCE(p_card_paid_kurus, 0) > 0 THEN
        IF p_pos_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'POS_BANKASI_ZORUNLU: Kredi kartı tahsilatlarında POS Bankası seçilmesi zorunludur.';
        END IF;

        SELECT * INTO v_pos_bank_rec
        FROM public.kasa_bank_accounts
        WHERE id = p_pos_bank_account_id FOR UPDATE;

        IF NOT FOUND OR v_pos_bank_rec.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'GEÇERSİZ_POS_BANKASI: Seçilen POS banka hesabı bulunamadı veya pasif.';
        END IF;

        IF v_pos_bank_rec.currency_code IS DISTINCT FROM 'TRY' THEN
            RAISE EXCEPTION 'GEÇERSİZ_POS_BANKASI: POS tahsilatı yalnızca TRY hesaplarına yapılabilir.';
        END IF;
    END IF;

    v_payload := jsonb_build_object(
        'kasa_day_id', p_kasa_day_id,
        'category_id', p_category_id,
        'product_name', TRIM(p_product_name),
        'total_price_kurus', p_total_price_kurus,
        'service_cost_kurus', p_service_cost_kurus,
        'service_cost_payment_status', v_effective_payment_status,
        'service_cost_bank_account_id', v_effective_bank_account_id,
        'cash_paid_kurus', p_cash_paid_kurus,
        'card_paid_kurus', p_card_paid_kurus,
        'pos_bank_account_id', p_pos_bank_account_id,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    IF v_cat_name = 'Teknik Servis' AND v_effective_payment_status = 'paid_from_bank' THEN
        SELECT * INTO v_bank_rec FROM public.kasa_bank_accounts WHERE id = v_effective_bank_account_id FOR UPDATE;
        IF NOT FOUND OR v_bank_rec.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Seçilen banka hesabı aktif değil veya bulunamadı.';
        END IF;
        IF v_bank_rec.currency_code <> 'TRY' THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Banka maliyet ödemesi sadece TRY hesaplarından yapılabilir.';
        END IF;
        IF v_bank_rec.current_balance_kurus < COALESCE(p_service_cost_kurus, 0) THEN
            RAISE EXCEPTION 'YETERSİZ_BANKA_BAKİYESİ: Banka hesabında servis maliyetini karşılayacak yeterli bakiye bulunmuyor.';
        END IF;
    END IF;

    v_seq_val := nextval('public.kasa_receipt_seq');
    v_receipt_no := 'FIS-' || to_char(v_day.date_val, 'YYYYMMDD') || '-' || lpad(v_seq_val::text, 4, '0');

    INSERT INTO public.kasa_sales (
        kasa_day_id, category_id, product_name, quantity, unit_price_kurus,
        total_price_kurus, cost_price_kurus, service_cost_kurus, cash_paid_kurus,
        card_paid_kurus, pos_bank_account_id, bank_transfer_paid_kurus, bank_transfer_reference,
        usd_paid_cents, usd_rate, usd_tl_equivalent_kurus, eur_paid_cents,
        eur_rate, eur_tl_equivalent_kurus, credit_customer_id, credit_paid_kurus,
        uncollected_credit_kurus, uncollected_cost_kurus, description,
        customer_name, customer_phone, serial_imei, technical_service_details,
        service_cost_payment_status, service_cost_payment_source, service_cost_bank_account_id,
        service_cost_paid_at, service_cost_paid_by_user_id,
        idempotency_key, created_by_user_id, status, receipt_no
    ) VALUES (
        p_kasa_day_id, p_category_id, TRIM(p_product_name), p_quantity, p_unit_price_kurus,
        p_total_price_kurus, p_cost_price_kurus, p_service_cost_kurus, p_cash_paid_kurus,
        p_card_paid_kurus, CASE WHEN COALESCE(p_card_paid_kurus, 0) > 0 THEN p_pos_bank_account_id ELSE NULL END,
        p_bank_transfer_paid_kurus, p_bank_transfer_reference,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, p_eur_paid_cents,
        p_eur_rate, p_eur_tl_equivalent_kurus, p_credit_customer_id, p_credit_paid_kurus,
        p_uncollected_credit_kurus, p_uncollected_cost_kurus, p_description,
        p_customer_name, p_customer_phone, p_serial_imei, p_technical_service_details,
        v_effective_payment_status, v_effective_payment_source, v_effective_bank_account_id,
        CASE WHEN v_cat_name = 'Teknik Servis' AND v_effective_payment_status IN ('paid_from_bank', 'paid_from_cash') THEN now() ELSE NULL END,
        CASE WHEN v_cat_name = 'Teknik Servis' AND v_effective_payment_status IN ('paid_from_bank', 'paid_from_cash') THEN p_actor_user_id ELSE NULL END,
        p_idempotency_key, p_actor_user_id, 'completed', v_receipt_no
    ) RETURNING id INTO v_sale_id;

    -- Kasa Hareketi (Nakit ve Kart kısımları)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'satis', v_sale_id, p_total_price_kurus, p_cash_paid_kurus, p_card_paid_kurus,
        'Satış: ' || TRIM(p_product_name) || ' (' || v_receipt_no || ')', p_actor_user_id
    );

    -- POS Banka Hareketi (Kredi Kartı Tahsilatı Banka Hesabına Eklenir)
    IF COALESCE(p_card_paid_kurus, 0) > 0 AND p_pos_bank_account_id IS NOT NULL THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_sale_id, status, created_by_user_id
        ) VALUES (
            p_pos_bank_account_id, 'pos_collection', 'in', p_card_paid_kurus, v_day.date_val,
            'POS / Kredi Kartı Tahsilatı (Fiş No: ' || v_receipt_no || ')',
            v_sale_id, 'active', p_actor_user_id
        ) RETURNING id INTO v_pos_tx_id;

        PERFORM public.fn_kasa_recalculate_bank_balance(p_pos_bank_account_id);
    END IF;

    -- Teknik Servis Maliyeti Bankadan Ödenmişse
    IF v_cat_name = 'Teknik Servis' AND v_effective_payment_status = 'paid_from_bank' AND v_effective_bank_account_id IS NOT NULL THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_sale_id, status, created_by_user_id
        ) VALUES (
            v_effective_bank_account_id, 'ts_cost_payment', 'out', p_service_cost_kurus, CURRENT_DATE,
            'Teknik Servis Maliyet Ödemesi: ' || TRIM(p_product_name) || ' (' || v_receipt_no || ')',
            v_sale_id, 'active', p_actor_user_id
        ) RETURNING id INTO v_bank_tx_id;

        PERFORM public.fn_kasa_recalculate_bank_balance(v_effective_bank_account_id);
    END IF;

    -- Teknik Servis Maliyeti Kasadan Ödenmişse Gider Kaydı
    IF v_cat_name = 'Teknik Servis' AND v_effective_payment_status = 'paid_from_cash' AND COALESCE(p_service_cost_kurus, 0) > 0 THEN
        INSERT INTO public.kasa_expenses (
            kasa_day_id, expense_category_id, amount_kurus, description, sale_id, created_by_user_id, status
        )
        SELECT v_day.id, ec.id, p_service_cost_kurus,
               'Teknik Servis Maliyet Ödemesi (Kasadan): ' || TRIM(p_product_name) || ' (' || v_receipt_no || ')',
               v_sale_id, p_actor_user_id, 'active'
        FROM public.kasa_expense_categories ec
        WHERE ec.name = 'Teknik Servis Gideri'
        LIMIT 1;
    END IF;

    SELECT to_jsonb(s) INTO v_cached FROM public.kasa_sales s WHERE s.id = v_sale_id;
    RETURN v_cached;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;

-- 2. RPC: FN_KASA_CREATE_SALE (32 Parametre Geriye Uyumluluk Sarmalayıcısı)
DROP FUNCTION IF EXISTS public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_create_sale(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT,
    p_service_cost_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_bank_transfer_paid_kurus BIGINT,
    p_bank_transfer_reference TEXT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC,
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC,
    p_eur_tl_equivalent_kurus BIGINT,
    p_credit_customer_id UUID,
    p_credit_paid_kurus BIGINT,
    p_uncollected_credit_kurus BIGINT,
    p_uncollected_cost_kurus BIGINT,
    p_description TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_serial_imei TEXT,
    p_technical_service_details JSONB,
    p_service_cost_payment_status TEXT,
    p_service_cost_payment_source TEXT,
    p_service_cost_bank_account_id UUID,
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
        p_unit_price_kurus, p_total_price_kurus, p_cost_price_kurus, p_service_cost_kurus,
        p_cash_paid_kurus, p_card_paid_kurus, p_bank_transfer_paid_kurus, p_bank_transfer_reference,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, p_eur_paid_cents,
        p_eur_rate, p_eur_tl_equivalent_kurus, p_credit_customer_id, p_credit_paid_kurus,
        p_uncollected_credit_kurus, p_uncollected_cost_kurus, p_description,
        p_customer_name, p_customer_phone, p_serial_imei, p_technical_service_details,
        p_service_cost_payment_status, p_service_cost_payment_source, p_service_cost_bank_account_id,
        p_idempotency_key, NULL::uuid
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT) TO service_role;

-- 3. RPC: FN_KASA_UPDATE_SALE (33 Parametre - POS Banka Destekli Ana Fonksiyon)
CREATE OR REPLACE FUNCTION public.fn_kasa_update_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
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
    p_idempotency_key TEXT DEFAULT NULL::text,
    p_justification TEXT DEFAULT NULL::text,
    p_pos_bank_account_id UUID DEFAULT NULL::uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_has_custom_update_permission BOOLEAN;
    v_sale_rec RECORD;
    v_bank_tx RECORD;
    v_pos_bank_rec RECORD;
    v_cat_name TEXT;
    v_effective_justification TEXT;
    v_updated_sale public.kasa_sales%ROWTYPE;
    v_effective_payment_status TEXT;
    v_effective_payment_source TEXT;
    v_effective_bank_account_id UUID;
BEGIN
    SELECT * INTO v_sale_rec FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND OR v_sale_rec.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_SATIŞ: Güncellenecek tamamlanmış satış bulunamadı veya satış iptal edilmiş.';
    END IF;

    PERFORM public.fn_kasa_assert_active_day_for_mutation(v_sale_rec.kasa_day_id);

    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    IF v_actor_role <> 'yonetici' AND v_sale_rec.created_by_user_id <> p_actor_user_id THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.sale.update'
              AND is_allowed = true
              AND revoked_at IS NULL
        ) INTO v_has_custom_update_permission;

        IF NOT COALESCE(v_has_custom_update_permission, false) THEN
            RAISE EXCEPTION 'YETKİSİZ: Başka personele ait satışları düzeltme yetkiniz bulunmamaktadır.';
        END IF;
    END IF;

    -- Kategori Adı
    SELECT name INTO v_cat_name FROM public.kasa_categories WHERE id = p_category_id;

    -- Normal satışlarda ve Teknik Servis dışı kategorilerde service_cost_payment_status varsayılanı 'previously_paid_or_stock'
    IF v_cat_name = 'Teknik Servis' THEN
        v_effective_payment_status := COALESCE(p_service_cost_payment_status, 'previously_paid_or_stock');
        v_effective_payment_source := p_service_cost_payment_source;
        v_effective_bank_account_id := p_service_cost_bank_account_id;
    ELSE
        v_effective_payment_status := COALESCE(p_service_cost_payment_status, 'previously_paid_or_stock');
        v_effective_payment_source := NULL;
        v_effective_bank_account_id := NULL;
    END IF;

    IF COALESCE(p_card_paid_kurus, 0) > 0 THEN
        IF p_pos_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'POS_BANKASI_ZORUNLU: Kredi kartı tahsilatlarında POS Bankası seçilmesi zorunludur.';
        END IF;

        SELECT * INTO v_pos_bank_rec FROM public.kasa_bank_accounts WHERE id = p_pos_bank_account_id FOR UPDATE;
        IF NOT FOUND OR v_pos_bank_rec.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'GEÇERSİZ_POS_BANKASI: Seçilen POS banka hesabı bulunamadı veya pasif.';
        END IF;

        IF v_pos_bank_rec.currency_code IS DISTINCT FROM 'TRY' THEN
            RAISE EXCEPTION 'GEÇERSİZ_POS_BANKASI: POS tahsilatı yalnızca TRY hesaplarına yapılabilir.';
        END IF;
    END IF;

    v_effective_justification := COALESCE(NULLIF(TRIM(p_justification), ''), NULLIF(TRIM(p_description), ''), 'Satış Düzeltme');

    -- Eski POS banka hareketlerini iptal et
    FOR v_bank_tx IN
        SELECT DISTINCT bank_account_id
        FROM public.kasa_bank_transactions
        WHERE related_sale_id = p_sale_id AND transaction_type = 'pos_collection' AND status = 'active'
    LOOP
        UPDATE public.kasa_bank_transactions
        SET status = 'cancelled', updated_at = now()
        WHERE related_sale_id = p_sale_id AND bank_account_id = v_bank_tx.bank_account_id AND transaction_type = 'pos_collection';

        PERFORM public.fn_kasa_recalculate_bank_balance(v_bank_tx.bank_account_id);
    END LOOP;

    -- Satış kaydını güncelle
    UPDATE public.kasa_sales
    SET category_id = p_category_id,
        product_name = TRIM(p_product_name),
        quantity = p_quantity,
        unit_price_kurus = p_unit_price_kurus,
        total_price_kurus = p_total_price_kurus,
        cost_price_kurus = p_cost_price_kurus,
        service_cost_kurus = p_service_cost_kurus,
        cash_paid_kurus = p_cash_paid_kurus,
        card_paid_kurus = p_card_paid_kurus,
        pos_bank_account_id = CASE WHEN COALESCE(p_card_paid_kurus, 0) > 0 THEN p_pos_bank_account_id ELSE NULL END,
        bank_transfer_paid_kurus = p_bank_transfer_paid_kurus,
        bank_transfer_reference = p_bank_transfer_reference,
        usd_paid_cents = p_usd_paid_cents,
        usd_rate = p_usd_rate,
        usd_tl_equivalent_kurus = p_usd_tl_equivalent_kurus,
        eur_paid_cents = p_eur_paid_cents,
        eur_rate = p_eur_rate,
        eur_tl_equivalent_kurus = p_eur_tl_equivalent_kurus,
        credit_customer_id = p_credit_customer_id,
        credit_paid_kurus = p_credit_paid_kurus,
        uncollected_credit_kurus = p_uncollected_credit_kurus,
        uncollected_cost_kurus = p_uncollected_cost_kurus,
        description = p_description,
        customer_name = p_customer_name,
        customer_phone = p_customer_phone,
        serial_imei = p_serial_imei,
        technical_service_details = p_technical_service_details,
        service_cost_payment_status = v_effective_payment_status,
        service_cost_payment_source = v_effective_payment_source,
        service_cost_bank_account_id = v_effective_bank_account_id,
        updated_at = now()
    WHERE id = p_sale_id
    RETURNING * INTO v_updated_sale;

    -- Yeni POS banka hareketini ekle
    IF COALESCE(p_card_paid_kurus, 0) > 0 AND p_pos_bank_account_id IS NOT NULL THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_sale_id, status, created_by_user_id
        ) VALUES (
            p_pos_bank_account_id, 'pos_collection', 'in', p_card_paid_kurus, CURRENT_DATE,
            'POS / Kredi Kartı Tahsilatı (Düzeltme - Fiş No: ' || v_updated_sale.receipt_no || ')',
            p_sale_id, 'active', p_actor_user_id
        );

        PERFORM public.fn_kasa_recalculate_bank_balance(p_pos_bank_account_id);
    END IF;

    -- Audit Log
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        p_actor_user_id, 'sale_updated', 'kasa_sales', p_sale_id,
        jsonb_build_object(
            'sale_id', p_sale_id,
            'receipt_no', v_updated_sale.receipt_no,
            'pos_bank_account_id', v_updated_sale.pos_bank_account_id,
            'total_price_kurus', p_total_price_kurus,
            'cash_paid_kurus', p_cash_paid_kurus,
            'card_paid_kurus', p_card_paid_kurus
        ),
        v_effective_justification
    );

    RETURN to_jsonb(v_updated_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;

-- 4. RPC: FN_KASA_UPDATE_SALE (32 Parametre Geriye Uyumluluk Sarmalayıcısı)
DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_update_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT,
    p_service_cost_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_bank_transfer_paid_kurus BIGINT,
    p_bank_transfer_reference TEXT,
    p_usd_paid_cents BIGINT,
    p_usd_rate NUMERIC,
    p_usd_tl_equivalent_kurus BIGINT,
    p_eur_paid_cents BIGINT,
    p_eur_rate NUMERIC,
    p_eur_tl_equivalent_kurus BIGINT,
    p_credit_customer_id UUID,
    p_credit_paid_kurus BIGINT,
    p_uncollected_credit_kurus BIGINT,
    p_uncollected_cost_kurus BIGINT,
    p_description TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_serial_imei TEXT,
    p_technical_service_details JSONB,
    p_service_cost_payment_status TEXT,
    p_service_cost_payment_source TEXT,
    p_service_cost_bank_account_id UUID,
    p_idempotency_key TEXT,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_kasa_update_sale(
        p_actor_user_id, p_sale_id, p_category_id, p_product_name, p_quantity,
        p_unit_price_kurus, p_total_price_kurus, p_cost_price_kurus, p_service_cost_kurus,
        p_cash_paid_kurus, p_card_paid_kurus, p_bank_transfer_paid_kurus, p_bank_transfer_reference,
        p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus, p_eur_paid_cents,
        p_eur_rate, p_eur_tl_equivalent_kurus, p_credit_customer_id, p_credit_paid_kurus,
        p_uncollected_credit_kurus, p_uncollected_cost_kurus, p_description,
        p_customer_name, p_customer_phone, p_serial_imei, p_technical_service_details,
        p_service_cost_payment_status, p_service_cost_payment_source, p_service_cost_bank_account_id,
        p_idempotency_key, p_justification, NULL::uuid
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;

COMMIT;
