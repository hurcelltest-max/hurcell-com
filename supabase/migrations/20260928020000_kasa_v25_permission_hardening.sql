-- ============================================================================
-- HURCELL KASA V25 PERMISSION HARDENING MIGRATION
-- ============================================================================
-- 1. Grant Bahar AYDAMGA explicit permissions for cash expense creation
--    ('kasa.expense.create') and sale update ('kasa.sale.update').
-- 2. Update fn_kasa_create_expense to enforce 'kasa.expense.create' for staff
--    on cash expenses, ensuring unauthorized staff (Koray) cannot create any expense.
-- 3. Update fn_kasa_update_sale to enforce 'kasa.sale.update' for all staff,
--    ensuring staff cannot update sales (including own sales) without explicit permission.
-- 4. Update fn_kasa_cancel_sale to enforce 'kasa.sale.cancel' for all staff,
--    ensuring staff cannot cancel sales (including own sales) without explicit permission.
-- ============================================================================

DO $$
DECLARE
    c_bahar_uuid CONSTANT UUID := '38eca216-7235-414b-8cc3-349087a166da';
    v_admin_id UUID;
    v_bahar public.kasa_users%ROWTYPE;
BEGIN
    SELECT * INTO v_bahar FROM public.kasa_users WHERE id = c_bahar_uuid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bahar AYDAMGA kullanıcısı bulunamadı.';
    END IF;

    SELECT id INTO v_admin_id
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    -- 1. kasa.expense.create yetkisi
    INSERT INTO public.kasa_user_permissions (
        user_id, permission_key, is_allowed, granted_by_user_id, granted_at
    ) VALUES (
        c_bahar_uuid, 'kasa.expense.create', true, v_admin_id, now()
    )
    ON CONFLICT (user_id, permission_key) DO UPDATE
    SET is_allowed = true, revoked_at = NULL, granted_at = now();

    -- 2. kasa.sale.update yetkisi
    INSERT INTO public.kasa_user_permissions (
        user_id, permission_key, is_allowed, granted_by_user_id, granted_at
    ) VALUES (
        c_bahar_uuid, 'kasa.sale.update', true, v_admin_id, now()
    )
    ON CONFLICT (user_id, permission_key) DO UPDATE
    SET is_allowed = true, revoked_at = NULL, granted_at = now();

    -- Audit Logs
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        v_admin_id, 'user_permission_granted', 'kasa_user_permissions', c_bahar_uuid,
        jsonb_build_object(
            'target_user_id', c_bahar_uuid,
            'target_username', v_bahar.username,
            'permissions', jsonb_build_array('kasa.expense.create', 'kasa.sale.update')
        ),
        'HurCELL Kasa V25 - Bahar AYDAMGA Genel Gider Oluşturma ve Satış Düzeltme Yetkileri Tanımlandı'
    );
END $$;

-- ============================================================================
-- 1. RPC: FN_KASA_CREATE_EXPENSE (YETKİ GÜÇLENDİRMELİ)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_create_expense(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_expense_category_id UUID,
    p_amount_kurus BIGINT,
    p_description TEXT,
    p_recipient_name TEXT DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash',
    p_bank_account_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
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
    v_exp public.kasa_expenses%ROWTYPE;
    v_cached public.kasa_expenses%ROWTYPE;
    v_acc public.kasa_bank_accounts%ROWTYPE;
    v_tx UUID := NULL;
    v_has_cash_permission BOOLEAN;
    v_has_bank_permission BOOLEAN;
    v_has_salary_permission BOOLEAN;
BEGIN
    -- Aktör Kullanıcı Kontrolü
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'YETKISIZ: Aktör kullanıcı belirtilmedi.';
    END IF;

    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF NOT FOUND OR v_actor.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
    END IF;

    -- Ödeme Yöntemi Doğrulaması
    IF p_payment_method NOT IN ('cash', 'bank') THEN
        RAISE EXCEPTION 'GECERSIZ_ODEME_YONTEMI: Ödeme yöntemi cash veya bank olmalıdır.';
    END IF;

    -- Genel Nakit Gideri Yetki Kontrolü
    IF p_payment_method = 'cash' AND v_actor.role IS DISTINCT FROM 'yonetici' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.expense.create'
              AND is_allowed IS TRUE
              AND revoked_at IS NULL
        ) INTO v_has_cash_permission;

        IF v_has_cash_permission IS NOT TRUE THEN
            RAISE EXCEPTION 'YETKISIZ: Gider ekleme yetkiniz bulunmamaktadır.';
        END IF;
    END IF;

    -- Banka Gideri Yetki Kontrolü
    IF p_payment_method = 'bank' AND v_actor.role IS DISTINCT FROM 'yonetici' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.expense.bank'
              AND is_allowed IS TRUE
              AND revoked_at IS NULL
        ) INTO v_has_bank_permission;

        IF v_has_bank_permission IS NOT TRUE THEN
            RAISE EXCEPTION 'YETKISIZ: Bankadan gider ekleme yetkisi yalnızca yöneticilere ve yetkili personele aittir.';
        END IF;
    END IF;

    IF p_amount_kurus IS NULL OR p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GECERSIZ_TUTAR: Gider tutarı 0 TL den büyük olmalıdır.';
    END IF;

    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'GECERSIZ_ACIKLAMA: Gider açıklaması zorunludur.';
    END IF;

    -- Idempotency Kontrolü
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
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
    END IF;

    -- Kronolojik Gün ve Açık Gün Kilidi
    v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

    -- Kategori Kontrolü
    SELECT * INTO v_cat FROM public.kasa_expense_categories WHERE id = p_expense_category_id;
    IF NOT FOUND OR v_cat.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'GECERSIZ_KATEGORI: Gider kategorisi bulunamadı veya pasif.';
    END IF;

    -- Maaş gideri yetki kontrolü: Yönetici VEYA 'kasa.expense.salary.create' iznine sahip personel
    IF (v_cat.is_salary_category IS TRUE OR v_cat.name = 'Personel Maaşı') AND v_actor.role IS DISTINCT FROM 'yonetici' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.expense.salary.create'
              AND is_allowed IS TRUE
              AND revoked_at IS NULL
        ) INTO v_has_salary_permission;

        IF v_has_salary_permission IS NOT TRUE THEN
            RAISE EXCEPTION 'YETKISIZ: Maaş giderini yalnız yönetici veya yetkili personel kaydedebilir.';
        END IF;

        IF p_recipient_name IS NULL OR TRIM(p_recipient_name) = '' THEN
            RAISE EXCEPTION 'ALICI_ZORUNLU: Personel maaşı giderlerinde alıcı / personel adı zorunludur.';
        END IF;
    END IF;

    -- Bakiye Kontrolleri
    IF p_payment_method = 'cash' THEN
        IF p_bank_account_id IS NOT NULL THEN
            RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Nakit giderde banka hesabı seçilemez.';
        END IF;
        IF public.fn_kasa_get_physical_cash(p_kasa_day_id) < p_amount_kurus THEN
            RAISE EXCEPTION 'YETERSIZ_NAKIT: Kasada bu gider için yeterli nakit bulunmuyor.';
        END IF;
    ELSE
        IF p_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Bankadan ödenen giderler için banka hesabı seçilmelidir.';
        END IF;

        SELECT * INTO v_acc FROM public.kasa_bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
        IF NOT FOUND OR v_acc.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Seçilen banka hesabı bulunamadı veya pasif.';
        END IF;

        IF v_acc.currency_code IS DISTINCT FROM 'TRY' THEN
            RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Aktif TRY hesabı seçilmelidir.';
        END IF;

        IF v_acc.current_balance_kurus < p_amount_kurus THEN
            RAISE EXCEPTION 'YETERSIZ_BAKIYE: Banka hesabında bu gideri karşılayacak yeterli bakiye bulunmuyor.';
        END IF;
    END IF;

    -- Gider Kaydını Ekle
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

    -- Muhasebe Hareketleri
    IF p_payment_method = 'cash' THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id,
            CASE WHEN v_cat.is_salary_category IS TRUE OR v_cat.name = 'Personel Maaşı' THEN 'salary_payment' ELSE 'nakit_gider' END,
            p_sale_id, -p_amount_kurus, -p_amount_kurus, 0,
            'Nakit Gider (' || v_cat.name || '): ' || trim(p_description), p_actor_user_id
        );
    ELSE
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_expense_id, status, created_by_user_id
        ) VALUES (
            p_bank_account_id, 'bank_expense', 'out', p_amount_kurus, CURRENT_DATE,
            'Banka Gideri (' || v_cat.name || '): ' || trim(p_description),
            v_exp.id, 'active', p_actor_user_id
        ) RETURNING id INTO v_tx;

        PERFORM public.fn_kasa_recalculate_bank_balance(p_bank_account_id);
    END IF;

    -- Audit Log
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        p_actor_user_id, 'expense_created', 'kasa_expenses', v_exp.id,
        jsonb_build_object(
            'kasa_day_id', p_kasa_day_id,
            'expense_category_id', p_expense_category_id,
            'category_name', v_cat.name,
            'amount_kurus', p_amount_kurus,
            'payment_method', p_payment_method,
            'bank_account_id', p_bank_account_id,
            'bank_tx_id', v_tx
        ),
        'Gider Girişi'
    );

    RETURN to_jsonb(v_exp);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID, TEXT) TO service_role;

-- ============================================================================
-- 2. RPC: FN_KASA_UPDATE_SALE (YETKİ GÜÇLENDİRMELİ)
-- ============================================================================
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

    SELECT role, is_active INTO v_actor_role, v_actor_active
    FROM public.kasa_users
    WHERE id = p_actor_user_id;

    IF NOT FOUND OR NOT COALESCE(v_actor_active, false) THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    -- Satış düzeltme yetki kontrolü: Yönetici VEYA 'kasa.sale.update' iznine sahip personel
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

    PERFORM public.fn_kasa_assert_active_day_for_mutation(v_sale_rec.kasa_day_id);

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
        idempotency_key = p_idempotency_key,
        updated_at = now()
    WHERE id = p_sale_id
    RETURNING * INTO v_updated_sale;

    -- Kasa hareketlerini güncelle (Eski hareketleri iptal edip yeni hareket yaz)
    UPDATE public.kasa_movements
    SET movement_type = 'satis_duzeltme_iptal',
        description = 'Satış Düzeltme İptali: ' || v_effective_justification,
        cash_portion_kurus = -cash_portion_kurus,
        card_portion_kurus = -card_portion_kurus,
        bank_transfer_portion_kurus = -bank_transfer_portion_kurus,
        amount_kurus = -amount_kurus
    WHERE sale_id = p_sale_id AND movement_type = 'satis';

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus,
        cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus,
        description, created_by_user_id
    ) VALUES (
        v_updated_sale.kasa_day_id, 'satis', v_updated_sale.id, v_updated_sale.total_price_kurus,
        v_updated_sale.cash_paid_kurus, v_updated_sale.card_paid_kurus, v_updated_sale.bank_transfer_paid_kurus,
        'Satış Düzeltme (' || v_cat_name || ' - ' || v_updated_sale.product_name || '): ' || v_effective_justification,
        p_actor_user_id
    );

    -- POS tahsilat banka hareketi ekle
    IF COALESCE(v_updated_sale.card_paid_kurus, 0) > 0 AND p_pos_bank_account_id IS NOT NULL THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_sale_id, status, created_by_user_id
        ) VALUES (
            p_pos_bank_account_id, 'pos_collection', 'in', v_updated_sale.card_paid_kurus, CURRENT_DATE,
            'POS Tahsilatı (Satış Düzeltme ' || COALESCE(v_updated_sale.receipt_no, '') || '): ' || v_updated_sale.product_name,
            v_updated_sale.id, 'active', p_actor_user_id
        );

        PERFORM public.fn_kasa_recalculate_bank_balance(p_pos_bank_account_id);
    END IF;

    -- Audit Log
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        p_actor_user_id, 'sale_updated', 'kasa_sales', v_updated_sale.id,
        jsonb_build_object(
            'sale_id', v_updated_sale.id,
            'old_sale', row_to_json(v_sale_rec),
            'new_sale', row_to_json(v_updated_sale),
            'justification', v_effective_justification
        ),
        v_effective_justification
    );

    RETURN to_jsonb(v_updated_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;

-- ============================================================================
-- 3. RPC: FN_KASA_CANCEL_SALE (YETKİ GÜÇLENDİRMELİ)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_justification TEXT,
    p_cancel_movements BOOLEAN DEFAULT true,
    p_idempotency_key TEXT DEFAULT NULL::text
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
    v_has_permission BOOLEAN;
    v_bank_tx RECORD;
    v_payload JSONB;
    v_cached JSONB;
    v_res JSONB;
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'YETKISIZ: Aktör kullanıcı belirtilmedi.';
    END IF;

    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF NOT FOUND OR v_actor.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SATIŞ_BULUNAMADI: İptal edilecek satış bulunamadı.';
    END IF;

    IF v_sale.status = 'cancelled' THEN
        RETURN to_jsonb(v_sale);
    END IF;

    -- Yetki kontrolü: Yönetici VEYA 'kasa.sale.cancel' iznine sahip personel
    IF v_actor.role <> 'yonetici' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.sale.cancel'
              AND is_allowed IS TRUE
              AND revoked_at IS NULL
        ) INTO v_has_permission;

        IF v_has_permission IS NOT TRUE THEN
            RAISE EXCEPTION 'YETKİSİZ: Satış iptal yetkiniz bulunmamaktadır.';
        END IF;
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEREKÇE_ZORUNLU: Satış iptali için gerekçe zorunludur.';
    END IF;

    v_day := public.fn_kasa_assert_active_day_for_mutation(v_sale.kasa_day_id);

    -- Idempotency Kontrolü
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        v_payload := jsonb_build_object(
            'action', 'cancel_sale',
            'sale_id', p_sale_id,
            'actor_user_id', p_actor_user_id,
            'justification', trim(p_justification)
        );
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- Satış Durumunu İptal Yap
    UPDATE public.kasa_sales
    SET status = 'cancelled',
        description = COALESCE(description, '') || ' [İptal Gerekçesi: ' || trim(p_justification) || ']',
        updated_at = now()
    WHERE id = p_sale_id
    RETURNING * INTO v_sale;

    -- POS Banka Hareketlerini İptal Et
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

    -- Kasa Hareketlerini Ters Kayıtla Dengele
    IF p_cancel_movements THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus,
            cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus,
            description, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'iptal', v_sale.id, -v_sale.total_price_kurus,
            -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus, -v_sale.bank_transfer_paid_kurus,
            'Satış İptali (' || v_sale.product_name || '): ' || trim(p_justification),
            p_actor_user_id
        );
    END IF;

    -- Cari Hesap Borcunu Geri Al
    IF v_sale.credit_paid_kurus > 0 AND v_sale.credit_customer_id IS NOT NULL THEN
        UPDATE public.credit_accounts
        SET current_balance = GREATEST(current_balance - (v_sale.credit_paid_kurus / 100.0), 0),
            updated_at = now()
        WHERE credit_customer_id = v_sale.credit_customer_id;

        INSERT INTO public.credit_transactions (
            credit_account_id, transaction_type, amount, balance_after,
            description, created_by
        )
        SELECT id, 'cancellation', -(v_sale.credit_paid_kurus / 100.0), current_balance,
               'Satış İptali: ' || trim(p_justification), p_actor_user_id
        FROM public.credit_accounts
        WHERE credit_customer_id = v_sale.credit_customer_id;
    END IF;

    -- Audit Log
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        p_actor_user_id, 'sale_cancelled', 'kasa_sales', v_sale.id,
        jsonb_build_object(
            'sale_id', v_sale.id,
            'total_price_kurus', v_sale.total_price_kurus,
            'cash_paid_kurus', v_sale.cash_paid_kurus,
            'card_paid_kurus', v_sale.card_paid_kurus,
            'bank_transfer_paid_kurus', v_sale.bank_transfer_paid_kurus,
            'credit_paid_kurus', v_sale.credit_paid_kurus,
            'justification', trim(p_justification)
        ),
        trim(p_justification)
    );

    v_res := to_jsonb(v_sale);

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        PERFORM public.fn_kasa_store_idempotency(p_actor_user_id, p_idempotency_key, v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) TO service_role;
