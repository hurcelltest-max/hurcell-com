-- ============================================================================
-- HurCELL Kasa V14 - Satış Düzeltme Sözleşmesi (Sale Update Contract Fix)
-- Amaç:
--  1. Eski 31-parametreli fn_kasa_update_sale fonksiyonunu DROP ederek tekil
--     kanonik 33-parametreli (p_product_name ve p_justification dahil) imzaya geçmek.
--  2. APPEND-ONLY MUHASEBE: Orijinal 'satis' hareketini değiştirmeden,
--     'satis_duzeltme_iptal' (ters kayıt) ve 'satis_duzeltme_yeni' (yeni kayıt) üretmek.
--  3. Teknik Servis nakit maliyetlerini (varsa) ts_cost_cash_refund ve ts_cost_cash_payment ile terslemek/kaydetmek.
--  4. public.kasa_sales tablosunu yeni değerlerle güncellemek (updated_at yazımı olmadan).
--  5. V11 kronolojik gün kilidini (fn_kasa_assert_active_day_for_mutation) entegre etmek.
--  6. Yetki kontrolü: Yöneticiler veya yalnızca kendi açtığı satışlar için personel yetkilidir.
--  7. SECURITY DEFINER, search_path = public, pg_temp, REVOKE ALL / GRANT service_role uygulamak.
-- ============================================================================

BEGIN;

-- 1. Eski 31-parametreli fonksiyonu açıkça kaldır
DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(
    UUID, UUID, UUID, INTEGER, BIGINT, BIGINT,
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT,
    UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB,
    TEXT, TEXT, UUID, TEXT
);

-- 2. Kanonik Fonksiyonu Tanımla
CREATE OR REPLACE FUNCTION public.fn_kasa_update_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INTEGER,
    p_unit_price_kurus BIGINT,
    p_total_price_kurus BIGINT,
    p_cost_price_kurus BIGINT DEFAULT NULL::BIGINT,
    p_service_cost_kurus BIGINT DEFAULT NULL::BIGINT,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_paid_kurus BIGINT DEFAULT 0,
    p_bank_transfer_reference TEXT DEFAULT NULL::TEXT,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL::NUMERIC,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL::NUMERIC,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_credit_customer_id UUID DEFAULT NULL::UUID,
    p_credit_paid_kurus BIGINT DEFAULT 0,
    p_uncollected_credit_kurus BIGINT DEFAULT 0,
    p_uncollected_cost_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL::TEXT,
    p_customer_name TEXT DEFAULT NULL::TEXT,
    p_customer_phone TEXT DEFAULT NULL::TEXT,
    p_serial_imei TEXT DEFAULT NULL::TEXT,
    p_technical_service_details JSONB DEFAULT NULL::JSONB,
    p_service_cost_payment_status TEXT DEFAULT NULL::TEXT,
    p_service_cost_payment_source TEXT DEFAULT NULL::TEXT,
    p_service_cost_bank_account_id UUID DEFAULT NULL::UUID,
    p_idempotency_key TEXT DEFAULT NULL::TEXT,
    p_justification TEXT DEFAULT NULL::TEXT
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
    v_existing_tx RECORD;
    v_bank_rec RECORD;
    v_payload JSONB;
    v_cached JSONB;
    v_res JSONB;
    v_effective_total BIGINT;
    v_category_name TEXT;
    v_calculated_uncollected_credit BIGINT := 0;
    v_calculated_uncollected_cost BIGINT := 0;
    v_effective_justification TEXT;
    v_old_cash_in BIGINT := 0;
    v_new_cash_in BIGINT := 0;
BEGIN
    -- 1. Hedef Satışı Kilitle ve Oku
    SELECT * INTO v_sale_rec FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND OR v_sale_rec.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_SATIŞ: Güncellenecek tamamlanmış satış bulunamadı veya satış iptal edilmiş.';
    END IF;

    -- 2. Aktif Gün Kilidi Denetimi (V11 Standardı)
    PERFORM public.fn_kasa_assert_active_day_for_mutation(v_sale_rec.kasa_day_id);

    -- 3. Aktör Kullanıcı ve Yetki Denetimi
    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    -- Yetki kuralı: Yönetici her satışı düzeltebilir.
    -- Personel yalnızca kendi oluşturduğu satışı düzeltebilir VEYA kasa.sale.update iznine sahip olmalıdır.
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

    -- 4. Bankadan Servis Maliyeti Ödemesi Yönetici Kontrolü
    IF (p_service_cost_payment_status = 'paid_from_bank' OR p_service_cost_payment_source = 'bank') THEN
        IF v_actor_role <> 'yonetici' THEN
            RAISE EXCEPTION 'BANKA_ÖDEMESİ_YETKİSİZ: Bankadan maliyet ödemesi yalnız yönetici yetkisindedir.';
        END IF;
    END IF;

    -- 5. Kategori Doğrulaması
    SELECT name INTO v_category_name FROM public.kasa_categories WHERE id = p_category_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Seçilen kategori bulunamadı veya pasif durumda.';
    END IF;

    IF v_category_name = 'Teknik Servis' THEN
        IF p_customer_name IS NULL OR LENGTH(TRIM(p_customer_name)) < 2 THEN
            RAISE EXCEPTION 'MÜŞTERİ_ADI_ZORUNLU: Teknik servis işlemlerinde müşteri adı soyadı zorunludur.';
        END IF;
    END IF;

    -- 6. Tutar ve Ödeme Eşitliği Doğrulaması
    v_effective_total := COALESCE(p_quantity, 1) * COALESCE(p_unit_price_kurus, 0);
    IF p_total_price_kurus <> v_effective_total THEN
        RAISE EXCEPTION 'TUTAR_UYUŞMAZLIĞI: Toplam tutar (adet x birim fiyat) ile uyuşmuyor.';
    END IF;

    IF (COALESCE(p_cash_paid_kurus, 0) +
        COALESCE(p_card_paid_kurus, 0) +
        COALESCE(p_bank_transfer_paid_kurus, 0) +
        COALESCE(p_usd_tl_equivalent_kurus, 0) +
        COALESCE(p_eur_tl_equivalent_kurus, 0) +
        COALESCE(p_credit_paid_kurus, 0)) <> p_total_price_kurus THEN
        RAISE EXCEPTION 'ÖDEME_UYUŞMAZLIĞI: Girilen ödemeler toplamı satış tutarına eşit olmalıdır.';
    END IF;

    IF COALESCE(p_credit_paid_kurus, 0) > 0 THEN
        IF p_credit_customer_id IS NULL THEN
            RAISE EXCEPTION 'CARİ_MÜŞTERİ_ZORUNLU: Veresiye / cari ödemelerde müşteri seçimi zorunludur.';
        END IF;
        v_calculated_uncollected_credit := p_credit_paid_kurus;
    END IF;

    v_effective_justification := COALESCE(NULLIF(TRIM(p_justification), ''), NULLIF(TRIM(p_description), ''), 'Satış Düzeltme');

    -- 7. İdempotency Denetimi
    v_payload := jsonb_build_object(
        'sale_id', p_sale_id,
        'category_id', p_category_id,
        'product_name', p_product_name,
        'quantity', p_quantity,
        'total_price_kurus', p_total_price_kurus,
        'cash_paid_kurus', p_cash_paid_kurus,
        'card_paid_kurus', p_card_paid_kurus,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus,
        'justification', v_effective_justification,
        'service_cost_payment_status', p_service_cost_payment_status,
        'service_cost_bank_account_id', p_service_cost_bank_account_id
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- 8. APPEND-ONLY MUHASEBE HAREKETLERİ
    -- A) Eski Satış Değerlerini Tersleyen Hareket (satis_duzeltme_iptal)
    v_old_cash_in := COALESCE(v_sale_rec.cash_paid_kurus, 0) + COALESCE(v_sale_rec.usd_tl_equivalent_kurus, 0) + COALESCE(v_sale_rec.eur_tl_equivalent_kurus, 0);

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale_rec.kasa_day_id,
        'satis_duzeltme_iptal',
        p_sale_id,
        -v_sale_rec.total_price_kurus,
        -v_old_cash_in,
        -COALESCE(v_sale_rec.card_paid_kurus, 0),
        -COALESCE(v_sale_rec.bank_transfer_paid_kurus, 0),
        'Satış Düzeltme İptali (' || v_sale_rec.receipt_no || '): ' || v_effective_justification,
        p_actor_user_id
    );

    -- B) Yeni Düzeltilmiş Satış Değerlerini Kaydeden Hareket (satis_duzeltme_yeni)
    v_new_cash_in := COALESCE(p_cash_paid_kurus, 0) + COALESCE(p_usd_tl_equivalent_kurus, 0) + COALESCE(p_eur_tl_equivalent_kurus, 0);

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale_rec.kasa_day_id,
        'satis_duzeltme_yeni',
        p_sale_id,
        p_total_price_kurus,
        v_new_cash_in,
        COALESCE(p_card_paid_kurus, 0),
        COALESCE(p_bank_transfer_paid_kurus, 0),
        'Satış Düzeltme (' || v_sale_rec.receipt_no || '): ' || v_effective_justification,
        p_actor_user_id
    );

    -- C) Teknik Servis Nakit Maliyet Hareketlerinin Düzeltilmesi (varsa)
    IF COALESCE(v_sale_rec.service_cost_kurus, 0) > 0 AND v_sale_rec.service_cost_payment_status = 'paid_from_cash' THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_sale_rec.kasa_day_id,
            'ts_cost_cash_refund',
            p_sale_id,
            v_sale_rec.service_cost_kurus,
            v_sale_rec.service_cost_kurus,
            0, 0,
            'Teknik Servis Maliyet Düzeltme İadesi (' || v_sale_rec.receipt_no || '): ' || v_effective_justification,
            p_actor_user_id
        );
    END IF;

    IF COALESCE(p_service_cost_kurus, 0) > 0 AND p_service_cost_payment_status = 'paid_from_cash' THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_sale_rec.kasa_day_id,
            'ts_cost_cash_payment',
            p_sale_id,
            -p_service_cost_kurus,
            -p_service_cost_kurus,
            0, 0,
            'Teknik Servis Maliyet Düzeltme Ödemesi (' || v_sale_rec.receipt_no || '): ' || v_effective_justification,
            p_actor_user_id
        );
    END IF;

    -- 9. Banka İşlemleri Yönetimi (Teknik Servis Maliyeti için)
    SELECT * INTO v_existing_tx FROM public.kasa_bank_transactions
    WHERE related_sale_id = p_sale_id AND transaction_type = 'ts_cost_payment' AND status = 'active'
    FOR UPDATE;

    IF v_existing_tx.id IS NOT NULL THEN
        UPDATE public.kasa_bank_transactions SET status = 'cancelled', updated_at = now() WHERE id = v_existing_tx.id;
        PERFORM public.fn_kasa_recalculate_bank_balance(v_existing_tx.bank_account_id);
    END IF;

    IF p_service_cost_payment_status = 'paid_from_bank' THEN
        IF p_service_cost_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'EKSİK_BANKA_HESABI: Bankadan ödenen teknik servis maliyeti için banka hesabı seçilmelidir.';
        END IF;

        SELECT * INTO v_bank_rec FROM public.kasa_bank_accounts WHERE id = p_service_cost_bank_account_id FOR UPDATE;
        IF NOT FOUND OR NOT v_bank_rec.is_active THEN
            RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Seçilen banka hesabı bulunamadı veya pasif durumda.';
        END IF;
        IF v_bank_rec.current_balance_kurus < COALESCE(p_service_cost_kurus, 0) THEN
            RAISE EXCEPTION 'YETERSİZ_BAKİYE: Banka hesabında servis maliyeti ödemesi için yeterli bakiye yok.';
        END IF;

        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date, description, related_sale_id, created_by_user_id
        ) VALUES (
            p_service_cost_bank_account_id, 'ts_cost_payment', 'out', COALESCE(p_service_cost_kurus, 0), CURRENT_DATE,
            'Teknik Servis Maliyet Ödemesi (Satış Düzeltme)', p_sale_id, p_actor_user_id
        );

        PERFORM public.fn_kasa_recalculate_bank_balance(p_service_cost_bank_account_id);
    END IF;

    -- 10. Satış Kaydını Güncelle (Şemada bulunmayan updated_at kaldırıldı)
    UPDATE public.kasa_sales SET
        category_id = p_category_id,
        product_name = TRIM(p_product_name),
        quantity = p_quantity,
        unit_price_kurus = p_unit_price_kurus,
        total_price_kurus = p_total_price_kurus,
        cost_price_kurus = p_cost_price_kurus,
        service_cost_kurus = p_service_cost_kurus,
        cash_paid_kurus = COALESCE(p_cash_paid_kurus, 0),
        card_paid_kurus = COALESCE(p_card_paid_kurus, 0),
        bank_transfer_paid_kurus = COALESCE(p_bank_transfer_paid_kurus, 0),
        bank_transfer_reference = p_bank_transfer_reference,
        usd_paid_cents = COALESCE(p_usd_paid_cents, 0),
        usd_rate = p_usd_rate,
        usd_tl_equivalent_kurus = COALESCE(p_usd_tl_equivalent_kurus, 0),
        eur_paid_cents = COALESCE(p_eur_paid_cents, 0),
        eur_rate = p_eur_rate,
        eur_tl_equivalent_kurus = COALESCE(p_eur_tl_equivalent_kurus, 0),
        credit_customer_id = p_credit_customer_id,
        credit_paid_kurus = COALESCE(p_credit_paid_kurus, 0),
        uncollected_credit_kurus = v_calculated_uncollected_credit,
        uncollected_cost_kurus = v_calculated_uncollected_cost,
        description = p_description,
        customer_name = p_customer_name,
        customer_phone = p_customer_phone,
        serial_imei = p_serial_imei,
        technical_service_details = p_technical_service_details,
        service_cost_payment_status = p_service_cost_payment_status,
        service_cost_payment_source = p_service_cost_payment_source,
        service_cost_bank_account_id = p_service_cost_bank_account_id
    WHERE id = p_sale_id;

    -- 11. Audit Log
    INSERT INTO public.kasa_audit_logs (
        kasa_day_id, user_id, action, target_entity, target_id, details
    ) VALUES (
        v_sale_rec.kasa_day_id, p_actor_user_id, 'sale_update', 'kasa_sales', p_sale_id,
        jsonb_build_object(
            'old_total_kurus', v_sale_rec.total_price_kurus,
            'new_total_kurus', p_total_price_kurus,
            'old_product_name', v_sale_rec.product_name,
            'new_product_name', TRIM(p_product_name),
            'receipt_no', v_sale_rec.receipt_no,
            'justification', v_effective_justification
        )
    );

    v_res := jsonb_build_object('success', true, 'sale_id', p_sale_id);

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'update_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

-- 3. Yetkilendirme
REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT,
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT,
    UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB,
    TEXT, TEXT, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT,
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT,
    UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB,
    TEXT, TEXT, UUID, TEXT, TEXT
) TO service_role;

COMMIT;
