-- ============================================================================
-- HurCELL Kasa V29 - Satış Düzeltme İdempotency Güvenliği, Eşzamanlılık Koruması
-- ve Kapalı Gün Nakit Değişimi Kısıtlaması (V29)
-- 
-- 1. İdempotency Güvenliği ve Fail-Closed Yaklaşımı:
--    - fn_kasa_save_idempotency içerisindeki 'WHEN OTHERS THEN NULL' kaldırıldı.
--    - İdempotency kaydı yazılamazsa finansal işlem tamamen rollback olur.
--    - Aynı anahtarın farklı kullanıcı veya farklı payload ile kullanımı ÇAKIŞAN_İDEMPOTENCY_KEY hatası üretir.
--    - Eşzamanlı mükerrer istekleri engellemek için pg_advisory_xact_lock eklendi.
-- 
-- 2. Kapalı Gün Nakit Bütünlüğü Kuralı:
--    - Kapanmış kasa günlerinde nakit devir zinciri ve fiziki sayım kilitlendiğinden nakit tutar değişikliği engellenir.
--    - Kapalı günlerde yönetici kart/POS bankası, havale, cari, müşteri ve ürün bilgilerini düzeltebilir.
--    - Açık kasa günlerinde nakit-kart geçişleri ve her türlü tahsilat düzeltmesi tam desteklenir.
-- ============================================================================

BEGIN;

-- 1. İDEMPOTENCY KONTROL FONKSİYONU (GÜVENLİ & KULLANICI KONTROLLÜ)
CREATE OR REPLACE FUNCTION public.fn_kasa_check_idempotency(
    p_actor_user_id UUID,
    p_idempotency_key TEXT,
    p_request_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_hash TEXT;
BEGIN
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'EKSİK_İDEMPOTENCY_KEY: Finansal işlem için idempotency key zorunludur.';
    END IF;

    v_hash := md5(p_request_payload::text);

    SELECT * INTO v_rec FROM public.kasa_idempotency_keys WHERE idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
        -- Farklı kullanıcı veya farklı istek denetimi
        IF v_rec.created_by_user_id IS NOT NULL AND p_actor_user_id IS NOT NULL AND v_rec.created_by_user_id <> p_actor_user_id THEN
            RAISE EXCEPTION 'ÇAKIŞAN_İDEMPOTENCY_KEY: Aynı idempotency key farklı bir kullanıcı tarafından kullanılamaz.';
        END IF;

        IF v_rec.request_hash <> v_hash THEN
            RAISE EXCEPTION 'ÇAKIŞAN_İDEMPOTENCY_KEY: Aynı idempotency key farklı bir işlem isteği ile kullanılamaz.';
        END IF;

        RETURN v_rec.response_body;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_check_idempotency(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_check_idempotency(UUID, TEXT, JSONB) TO service_role;


-- 2. İDEMPOTENCY KAYIT FONKSİYONU (FAIL-CLOSED & TAM DOĞRULAMA)
CREATE OR REPLACE FUNCTION public.fn_kasa_save_idempotency(
    p_actor_user_id UUID,
    p_idempotency_key TEXT,
    p_action_name TEXT,
    p_request_payload JSONB,
    p_response_body JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_hash TEXT := md5(p_request_payload::text);
    v_existing RECORD;
BEGIN
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'EKSİK_İDEMPOTENCY_KEY: İdempotency kaydı için anahtar zorunludur.';
    END IF;

    SELECT * INTO v_existing FROM public.kasa_idempotency_keys WHERE idempotency_key = TRIM(p_idempotency_key);
    IF FOUND THEN
        IF v_existing.created_by_user_id IS NOT NULL AND p_actor_user_id IS NOT NULL AND v_existing.created_by_user_id <> p_actor_user_id THEN
            RAISE EXCEPTION 'ÇAKIŞAN_İDEMPOTENCY_KEY: Aynı idempotency key farklı bir kullanıcı tarafından kullanılamaz.';
        END IF;
        IF v_existing.request_hash <> v_hash THEN
            RAISE EXCEPTION 'ÇAKIŞAN_İDEMPOTENCY_KEY: Aynı idempotency key farklı bir işlem isteği ile kullanılamaz.';
        END IF;

        UPDATE public.kasa_idempotency_keys
        SET response_body = p_response_body,
            action_name = p_action_name
        WHERE idempotency_key = TRIM(p_idempotency_key);
        RETURN;
    END IF;

    -- Fail-closed: Hatalar gizlenmez, işlem başarısız olursa finansal işlem de rollback olur
    INSERT INTO public.kasa_idempotency_keys (
        idempotency_key, request_hash, action_name, response_body, created_by_user_id, created_at
    ) VALUES (
        TRIM(p_idempotency_key), v_hash, p_action_name, p_response_body, p_actor_user_id, now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_save_idempotency(UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_save_idempotency(UUID, TEXT, TEXT, JSONB, JSONB) TO service_role;


CREATE OR REPLACE FUNCTION public.fn_kasa_store_idempotency(
    p_actor_user_id UUID,
    p_idempotency_key TEXT,
    p_request_payload JSONB,
    p_response_body JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'kasa_action', p_request_payload, p_response_body);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_store_idempotency(UUID, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_store_idempotency(UUID, TEXT, JSONB, JSONB) TO service_role;


-- 3. GÜNCELLENMİŞ VE GÜÇLENDİRİLMİŞ SATIŞ DÜZELTME FONKSİYONU (34 PARAMETRE)
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
    p_justification TEXT DEFAULT NULL::TEXT,
    p_pos_bank_account_id UUID DEFAULT NULL::UUID
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
    v_day_rec public.kasa_days%ROWTYPE;
    v_is_historical_day BOOLEAN := false;
    v_bank_tx RECORD;
    v_bank_rec RECORD;
    v_pos_bank_rec RECORD;
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
    v_updated_sale public.kasa_sales%ROWTYPE;
BEGIN
    -- Eşzamanlı İstek Kilidi (Advisory Lock)
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        PERFORM pg_advisory_xact_lock(hashtext('idempotency_sale_update_' || TRIM(p_idempotency_key)));
    END IF;

    -- 1. Hedef Satışı Kilitle ve Oku
    SELECT * INTO v_sale_rec FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND OR v_sale_rec.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_SATIŞ: Güncellenecek tamamlanmış satış bulunamadı veya satış iptal edilmiş.';
    END IF;

    -- 2. Aktör Kullanıcı Doğrulaması
    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    -- Yetki Kontrolü:
    -- Yönetici (yonetici) doğrudan yetkilidir.
    -- Personel KENDİ satışı olsa dahi yalnızca aktif, iptal edilmemiş 'kasa.sale.update' izni varsa düzeltebilir.
    -- Satışın sahibi olmak tek başına izin sağlamaz.
    IF v_actor_role <> 'yonetici' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.sale.update'
              AND is_allowed = true
              AND revoked_at IS NULL
        ) INTO v_has_custom_update_permission;

        IF NOT COALESCE(v_has_custom_update_permission, false) THEN
            RAISE EXCEPTION 'YETKİSİZ: Satış düzeltme yetkiniz bulunmamaktadır.';
        END IF;
    END IF;

    -- 3. Kasa Günü Durumu ve Geçmiş Gün Nakit Koruması
    SELECT * INTO v_day_rec FROM public.kasa_days WHERE id = v_sale_rec.kasa_day_id;
    IF v_day_rec.id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_GÜN: Satışın bağlı olduğu kasa günü bulunamadı.';
    END IF;

    v_old_cash_in := COALESCE(v_sale_rec.cash_paid_kurus, 0) + COALESCE(v_sale_rec.usd_tl_equivalent_kurus, 0) + COALESCE(v_sale_rec.eur_tl_equivalent_kurus, 0);
    v_new_cash_in := COALESCE(p_cash_paid_kurus, 0) + COALESCE(p_usd_tl_equivalent_kurus, 0) + COALESCE(p_eur_tl_equivalent_kurus, 0);

    IF v_day_rec.status <> 'open' THEN
        -- Kapalı gün: Personel kesinlikle işlem yapamaz.
        IF v_actor_role <> 'yonetici' THEN
            RAISE EXCEPTION 'KASA_GUNU_KAPALI: Kapalı kasa gününe ait satışlar personel tarafından düzeltilemez. Yalnızca yönetici gerekçe belirterek geçmiş gün düzeltmesi yapabilir.';
        END IF;

        -- Kapalı gün nakit tutarlılığı kuralı: Kapanmış günün fiziki sayım ve devir zincirini korumak için nakit tutar değiştirilemez
        IF v_new_cash_in <> v_old_cash_in THEN
            RAISE EXCEPTION 'KAPALI_GÜN_NAKİT_DEĞİŞTİRİLEMEZ: Kapanmış kasa günlerinde kasa devir zinciri ve fiziki sayım tutarlılığını korumak amacıyla nakit tutar değişikliği yapılamaz. Kapalı günlerde yalnızca kart/POS bankası, havale, cari ve ürün bilgisi düzeltmeleri yapılabilir.';
        END IF;

        v_is_historical_day := true;
    ELSE
        -- Açık gün: Aktif açık gün olup olmadığı kontrol edilir
        PERFORM public.fn_kasa_assert_active_day_for_mutation(v_sale_rec.kasa_day_id);
    END IF;

    IF p_justification IS NULL OR TRIM(p_justification) = '' THEN
        RAISE EXCEPTION 'GEREKÇE_ZORUNLU: Satış düzeltmesi için gerekçe belirtilmesi zorunludur.';
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

    -- POS Banka Doğrulaması
    IF COALESCE(p_card_paid_kurus, 0) > 0 THEN
        IF p_pos_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'POS_BANKASI_ZORUNLU: Kredi kartı tahsilatlarında POS Bankası seçilmesi zorunludur.';
        END IF;

        SELECT * INTO v_pos_bank_rec FROM public.kasa_bank_accounts 
        WHERE id = p_pos_bank_account_id AND is_active = true AND currency_code = 'TRY'
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'GEÇERSİZ_POS_BANKASI: Seçilen POS banka hesabı aktif değil veya TRY cinsinden değil.';
        END IF;
    END IF;

    v_effective_justification := TRIM(p_justification);

    -- 7. İdempotency Denetimi
    v_payload := jsonb_build_object(
        'sale_id', p_sale_id,
        'category_id', p_category_id,
        'product_name', p_product_name,
        'quantity', p_quantity,
        'unit_price_kurus', p_unit_price_kurus,
        'total_price_kurus', p_total_price_kurus,
        'cost_price_kurus', p_cost_price_kurus,
        'service_cost_kurus', p_service_cost_kurus,
        'cash_paid_kurus', p_cash_paid_kurus,
        'card_paid_kurus', p_card_paid_kurus,
        'pos_bank_account_id', p_pos_bank_account_id,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus,
        'bank_transfer_reference', p_bank_transfer_reference,
        'justification', v_effective_justification,
        'service_cost_payment_status', p_service_cost_payment_status,
        'service_cost_payment_source', p_service_cost_payment_source,
        'service_cost_bank_account_id', p_service_cost_bank_account_id
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- 8. APPEND-ONLY MUHASEBE HAREKETLERİ (kasa_movements)
    -- A) Eski Satış Değerlerini Tersleyen Hareket (satis_duzeltme_iptal)
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

    -- 9. POS BANKA HAREKETLERİ YÖNETİMİ
    -- Eski POS banka hareketlerini iptal et ve bakiyeyi güncelle
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

    -- Yeni POS banka hareketini ekle ve bakiyeyi güncelle
    IF COALESCE(p_card_paid_kurus, 0) > 0 AND p_pos_bank_account_id IS NOT NULL THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_sale_id, status, created_by_user_id
        ) VALUES (
            p_pos_bank_account_id, 'pos_collection', 'in', p_card_paid_kurus, CURRENT_DATE,
            'POS / Kredi Kartı Tahsilatı (Düzeltme - Fiş No: ' || v_sale_rec.receipt_no || ')',
            p_sale_id, 'active', p_actor_user_id
        );

        PERFORM public.fn_kasa_recalculate_bank_balance(p_pos_bank_account_id);
    END IF;

    -- 10. TEKNİK SERVİS BANKA MALİYETİ YÖNETİMİ
    FOR v_bank_tx IN
        SELECT DISTINCT bank_account_id
        FROM public.kasa_bank_transactions
        WHERE related_sale_id = p_sale_id AND transaction_type = 'ts_cost_payment' AND status = 'active'
    LOOP
        UPDATE public.kasa_bank_transactions
        SET status = 'cancelled', updated_at = now()
        WHERE related_sale_id = p_sale_id AND bank_account_id = v_bank_tx.bank_account_id AND transaction_type = 'ts_cost_payment';

        PERFORM public.fn_kasa_recalculate_bank_balance(v_bank_tx.bank_account_id);
    END LOOP;

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
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_sale_id, status, created_by_user_id
        ) VALUES (
            p_service_cost_bank_account_id, 'ts_cost_payment', 'out', COALESCE(p_service_cost_kurus, 0), CURRENT_DATE,
            'Teknik Servis Maliyet Ödemesi (Satış Düzeltme - Fiş No: ' || v_sale_rec.receipt_no || ')',
            p_sale_id, 'active', p_actor_user_id
        );

        PERFORM public.fn_kasa_recalculate_bank_balance(p_service_cost_bank_account_id);
    END IF;

    -- 11. CARİ HESAPLARIN GÜNCELLENMESİ (varsa)
    IF COALESCE(v_sale_rec.credit_paid_kurus, 0) <> COALESCE(p_credit_paid_kurus, 0) OR (v_sale_rec.credit_customer_id IS DISTINCT FROM p_credit_customer_id) THEN
        IF COALESCE(v_sale_rec.credit_paid_kurus, 0) > 0 AND v_sale_rec.credit_customer_id IS NOT NULL THEN
            UPDATE public.credit_accounts
            SET current_balance = GREATEST(current_balance - (v_sale_rec.credit_paid_kurus / 100.0), 0),
                updated_at = now()
            WHERE credit_customer_id = v_sale_rec.credit_customer_id;

            INSERT INTO public.credit_transactions (
                credit_account_id, transaction_type, amount, balance_after, description, created_by
            )
            SELECT id, 'cancellation', -(v_sale_rec.credit_paid_kurus / 100.0), current_balance,
                   'Satış Düzeltme İptali (' || v_sale_rec.receipt_no || ')', p_actor_user_id
            FROM public.credit_accounts
            WHERE credit_customer_id = v_sale_rec.credit_customer_id;
        END IF;

        IF COALESCE(p_credit_paid_kurus, 0) > 0 AND p_credit_customer_id IS NOT NULL THEN
            UPDATE public.credit_accounts
            SET current_balance = current_balance + (p_credit_paid_kurus / 100.0),
                updated_at = now()
            WHERE credit_customer_id = p_credit_customer_id;

            INSERT INTO public.credit_transactions (
                credit_account_id, transaction_type, amount, balance_after, description, created_by
            )
            SELECT id, 'sale', (p_credit_paid_kurus / 100.0), current_balance,
                   'Satış Düzeltme Borç Kaydı (' || v_sale_rec.receipt_no || ')', p_actor_user_id
            FROM public.credit_accounts
            WHERE credit_customer_id = p_credit_customer_id;
        END IF;
    END IF;

    -- 12. SATIŞ KAYDINI GÜNCELLE
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
        pos_bank_account_id = CASE WHEN COALESCE(p_card_paid_kurus, 0) > 0 THEN p_pos_bank_account_id ELSE NULL END,
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
    WHERE id = p_sale_id
    RETURNING * INTO v_updated_sale;

    -- 13. AUDIT LOG KAYDI (public.kasa_audit_logs ile tam uyumlu)
    INSERT INTO public.kasa_audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        justification
    ) VALUES (
        p_actor_user_id,
        'sale_update',
        'kasa_sales',
        p_sale_id,
        jsonb_build_object(
            'kasa_day_id', v_sale_rec.kasa_day_id,
            'kasa_day_date', v_day_rec.date_val,
            'is_historical_day_correction', v_is_historical_day,
            'receipt_no', v_sale_rec.receipt_no,
            'old_total_kurus', v_sale_rec.total_price_kurus,
            'new_total_kurus', p_total_price_kurus,
            'old_cash_paid_kurus', v_sale_rec.cash_paid_kurus,
            'new_cash_paid_kurus', p_cash_paid_kurus,
            'old_card_paid_kurus', v_sale_rec.card_paid_kurus,
            'new_card_paid_kurus', p_card_paid_kurus,
            'old_pos_bank_account_id', v_sale_rec.pos_bank_account_id,
            'new_pos_bank_account_id', p_pos_bank_account_id,
            'old_product_name', v_sale_rec.product_name,
            'new_product_name', TRIM(p_product_name),
            'justification', v_effective_justification
        ),
        v_effective_justification
    );

    v_res := to_jsonb(v_updated_sale);

    -- 14. İdempotency Sonucunu Kaydet (Fail-Closed)
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'update_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT,
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT,
    UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB,
    TEXT, TEXT, UUID, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT,
    BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT,
    UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB,
    TEXT, TEXT, UUID, TEXT, TEXT, UUID
) TO service_role;

-- Geriye uyumlu 33 parametreli overload
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
        p_idempotency_key, p_justification, NULL::UUID
    );
END;
$$;

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
