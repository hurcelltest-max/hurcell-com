-- ============================================================================
-- Migration: 20260925150000_kasa_bank_pos_salary_v23.sql
-- Description: HurCELL Kasa V23 - 6 Banka Hesabı, Günlük Gerçek Banka Bakiyesi Girişi,
--              POS/Kart Tahsilatlarının Bankaya Otomatik İşlenmesi ve
--              Bahar AYDAMGA Personel Maaşı Gideri Ekleme Yetkisi
-- Güvenlik: Fail-closed transaction, SECURITY DEFINER, search_path = public, pg_temp,
--           REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT TO service_role only.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ALTI GERÇEK TRY BANKA HESABININ TANIMLANMASI (IDEMPOTENT & AUDITED)
-- ============================================================================
DO $$
DECLARE
    v_admin_id UUID;
    v_bank_names TEXT[] := ARRAY['TEB', 'Garanti BBVA', 'Türkiye İş Bankası', 'Akbank', 'QNB Finansbank', 'VakıfBank'];
    v_bank TEXT;
    v_order INT := 1;
    v_acc_id UUID;
BEGIN
    SELECT id INTO v_admin_id
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Aktif yönetici kullanıcı bulunamadı.';
    END IF;

    FOREACH v_bank IN ARRAY v_bank_names
    LOOP
        SELECT id INTO v_acc_id
        FROM public.kasa_bank_accounts
        WHERE bank_name = v_bank AND currency_code = 'TRY';

        IF v_acc_id IS NULL THEN
            INSERT INTO public.kasa_bank_accounts (
                account_name, bank_name, currency_code,
                opening_balance_kurus, current_balance_kurus,
                is_active, display_order, notes
            ) VALUES (
                v_bank || ' TRY Hesabı', v_bank, 'TRY',
                0, 0,
                true, v_order, 'V23 Sistem Banka Hesabı'
            ) RETURNING id INTO v_acc_id;

            INSERT INTO public.kasa_audit_logs (
                user_id, action, entity_type, entity_id, details, justification
            ) VALUES (
                v_admin_id, 'bank_account_created', 'kasa_bank_accounts', v_acc_id,
                jsonb_build_object(
                    'bank_name', v_bank,
                    'account_name', v_bank || ' TRY Hesabı',
                    'currency_code', 'TRY',
                    'initial_balance_kurus', 0
                ),
                'HurCELL Kasa V23 - Standart 6 Banka Hesabı Tanımlandı'
            );
        ELSE
            UPDATE public.kasa_bank_accounts
            SET is_active = true,
                display_order = v_order,
                updated_at = now()
            WHERE id = v_acc_id;
        END IF;

        v_order := v_order + 1;
    END LOOP;
END $$;

-- ============================================================================
-- 2. KASA_SALES TABLOSUNA POS_BANK_ACCOUNT_ID KOLONU EKLENMESİ
-- ============================================================================
ALTER TABLE public.kasa_sales
    ADD COLUMN IF NOT EXISTS pos_bank_account_id UUID REFERENCES public.kasa_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kasa_sales_pos_bank ON public.kasa_sales(pos_bank_account_id);

-- ============================================================================
-- 3. KASA_BANK_TRANSACTIONS TİP KISITLAMASININ GENİŞLETİLMESİ
-- ============================================================================
ALTER TABLE public.kasa_bank_transactions
    DROP CONSTRAINT IF EXISTS chk_kasa_bank_tx_type;

ALTER TABLE public.kasa_bank_transactions
    ADD CONSTRAINT chk_kasa_bank_tx_type CHECK (transaction_type IN (
        'opening_balance',
        'capital_injection',
        'owner_withdrawal',
        'pos_settlement',
        'pos_collection',
        'pos_reversal',
        'bank_expense',
        'expense_reversal',
        'ts_cost_payment',
        'bank_transfer_in',
        'bank_transfer_out',
        'bank_to_cash_withdrawal',
        'cash_to_bank_deposit',
        'bank_adjustment',
        'balance_adjustment'
    ));

-- ============================================================================
-- 4. GÜNLÜK GERÇEK BANKA BAKİYESİ TABLOSU (KASA_BANK_DAILY_SNAPSHOTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kasa_bank_daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES public.kasa_bank_accounts(id) ON DELETE CASCADE,
    date_val DATE NOT NULL DEFAULT CURRENT_DATE,
    reported_balance_kurus BIGINT NOT NULL,
    system_balance_kurus BIGINT NOT NULL,
    difference_kurus BIGINT NOT NULL,
    adjustment_transaction_id UUID REFERENCES public.kasa_bank_transactions(id) ON DELETE SET NULL,
    justification TEXT,
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_kasa_bank_daily_snapshots_account_date UNIQUE (bank_account_id, date_val)
);

CREATE INDEX IF NOT EXISTS idx_kasa_bank_daily_snapshots_date ON public.kasa_bank_daily_snapshots(date_val);
CREATE INDEX IF NOT EXISTS idx_kasa_bank_daily_snapshots_acc ON public.kasa_bank_daily_snapshots(bank_account_id);

-- ============================================================================
-- 5. BAHAR AYDAMGA YETKİLENDİRMESİ (kasa.bank.balance.record & kasa.expense.salary.create)
-- ============================================================================
DO $$
DECLARE
    c_target_uuid CONSTANT UUID := '38eca216-7235-414b-8cc3-349087a166da'::uuid;
    v_target_user public.kasa_users%ROWTYPE;
    v_admin_id UUID;
BEGIN
    SELECT * INTO v_target_user
    FROM public.kasa_users
    WHERE id = c_target_uuid;

    IF v_target_user.id IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Hedef kullanıcı Bahar AYDAMGA (%) bulunamadı.', c_target_uuid;
    END IF;

    IF v_target_user.role IS DISTINCT FROM 'personel' THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Bahar kullanıcısının rolü personel olmalıdır (Mevcut: %).', v_target_user.role;
    END IF;

    SELECT id INTO v_admin_id
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    -- 1. kasa.bank.balance.record yetkisi
    INSERT INTO public.kasa_user_permissions (
        user_id, permission_key, is_allowed, granted_by_user_id, granted_at
    ) VALUES (
        c_target_uuid, 'kasa.bank.balance.record', true, v_admin_id, now()
    )
    ON CONFLICT (user_id, permission_key) DO UPDATE
    SET is_allowed = true, revoked_at = NULL, granted_at = now();

    -- 2. kasa.expense.salary.create yetkisi
    INSERT INTO public.kasa_user_permissions (
        user_id, permission_key, is_allowed, granted_by_user_id, granted_at
    ) VALUES (
        c_target_uuid, 'kasa.expense.salary.create', true, v_admin_id, now()
    )
    ON CONFLICT (user_id, permission_key) DO UPDATE
    SET is_allowed = true, revoked_at = NULL, granted_at = now();

    -- Audit Logs
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        v_admin_id, 'user_permission_granted', 'kasa_user_permissions', c_target_uuid,
        jsonb_build_object(
            'target_user_id', c_target_uuid,
            'target_username', v_target_user.username,
            'permissions', jsonb_build_array('kasa.bank.balance.record', 'kasa.expense.salary.create')
        ),
        'HurCELL Kasa V23 - Bahar AYDAMGA Günlük Banka Mutabakatı ve Personel Maaşı Gideri Ekleme Yetkileri Tanımlandı'
    );
END $$;

-- ============================================================================
-- 6. RPC: FN_KASA_RECORD_BANK_DAILY_BALANCE (MUTABAKAT & BAKİYE DÜZELTME)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_record_bank_daily_balance(
    p_actor_user_id UUID,
    p_bank_account_id UUID,
    p_date_val DATE,
    p_reported_balance_kurus BIGINT,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_acc public.kasa_bank_accounts%ROWTYPE;
    v_has_permission BOOLEAN := false;
    v_existing_snapshot public.kasa_bank_daily_snapshots%ROWTYPE;
    v_system_balance BIGINT;
    v_diff BIGINT;
    v_adj_tx_id UUID := NULL;
    v_new_snapshot public.kasa_bank_daily_snapshots%ROWTYPE;
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'YETKISIZ: Aktör kullanıcı belirtilmedi.';
    END IF;

    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF NOT FOUND OR v_actor.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
    END IF;

    IF v_actor.role = 'yonetici' THEN
        v_has_permission := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.bank.balance.record'
              AND is_allowed IS TRUE
              AND revoked_at IS NULL
        ) INTO v_has_permission;
    END IF;

    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'YETKISIZ: Günlük banka bakiyesi girme yetkiniz bulunmamaktadır.';
    END IF;

    IF p_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Banka hesabı belirtilmelidir.';
    END IF;

    SELECT * INTO v_acc FROM public.kasa_bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND OR v_acc.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'GEÇERSİZ_BANKA_HESABI: Banka hesabı bulunamadı veya pasif.';
    END IF;

    IF p_reported_balance_kurus IS NULL OR p_reported_balance_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_BAKİYE: Gerçek banka bakiyesi 0 veya daha büyük bir tutar olmalıdır.';
    END IF;

    -- Mevcut snapshot'ı kontrol et
    SELECT * INTO v_existing_snapshot
    FROM public.kasa_bank_daily_snapshots
    WHERE bank_account_id = p_bank_account_id AND date_val = p_date_val
    FOR UPDATE;

    -- Eğer aynı gün için daha önce bir düzeltme hareketi üretilmişse onu iptal et
    IF v_existing_snapshot.adjustment_transaction_id IS NOT NULL THEN
        UPDATE public.kasa_bank_transactions
        SET status = 'cancelled', updated_at = now()
        WHERE id = v_existing_snapshot.adjustment_transaction_id;
    END IF;

    -- Güncel sistem bakiyesini hesapla
    v_system_balance := public.fn_kasa_recalculate_bank_balance(p_bank_account_id);
    v_diff := p_reported_balance_kurus - v_system_balance;

    -- Fark varsa idempotent düzeltme banka hareketi ekle
    IF v_diff <> 0 THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id,
            transaction_type,
            direction,
            amount_kurus,
            transaction_date,
            description,
            justification,
            status,
            created_by_user_id
        ) VALUES (
            p_bank_account_id,
            'balance_adjustment',
            CASE WHEN v_diff > 0 THEN 'in' ELSE 'out' END,
            ABS(v_diff),
            p_date_val,
            'Banka Bakiyesi Günlük Mutabakat Düzeltmesi (' || to_char(p_date_val, 'DD.MM.YYYY') || ')',
            COALESCE(NULLIF(TRIM(p_justification), ''), 'Günlük gerçek bakiye mutabakat girişi'),
            'active',
            p_actor_user_id
        ) RETURNING id INTO v_adj_tx_id;

        -- Hesap bakiyesini yeniden güncelle
        PERFORM public.fn_kasa_recalculate_bank_balance(p_bank_account_id);
    END IF;

    -- Snapshot tablosuna UPSERT et
    INSERT INTO public.kasa_bank_daily_snapshots (
        bank_account_id,
        date_val,
        reported_balance_kurus,
        system_balance_kurus,
        difference_kurus,
        adjustment_transaction_id,
        justification,
        created_by_user_id,
        updated_at
    ) VALUES (
        p_bank_account_id,
        p_date_val,
        p_reported_balance_kurus,
        v_system_balance,
        v_diff,
        v_adj_tx_id,
        COALESCE(NULLIF(TRIM(p_justification), ''), 'Günlük mutabakat kaydı'),
        p_actor_user_id,
        now()
    )
    ON CONFLICT (bank_account_id, date_val) DO UPDATE
    SET reported_balance_kurus = EXCLUDED.reported_balance_kurus,
        system_balance_kurus = EXCLUDED.system_balance_kurus,
        difference_kurus = EXCLUDED.difference_kurus,
        adjustment_transaction_id = EXCLUDED.adjustment_transaction_id,
        justification = EXCLUDED.justification,
        created_by_user_id = EXCLUDED.created_by_user_id,
        updated_at = now()
    RETURNING * INTO v_new_snapshot;

    -- Audit log
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        p_actor_user_id, 'bank_balance_snapshot_recorded', 'kasa_bank_daily_snapshots', v_new_snapshot.id,
        jsonb_build_object(
            'bank_account_id', p_bank_account_id,
            'bank_name', v_acc.bank_name,
            'date_val', p_date_val,
            'reported_balance_kurus', p_reported_balance_kurus,
            'system_balance_kurus', v_system_balance,
            'difference_kurus', v_diff,
            'adjustment_transaction_id', v_adj_tx_id
        ),
        'HurCELL Kasa V23 - Günlük Banka Bakiyesi Mutabakatı Kaydedildi'
    );

    RETURN jsonb_build_object(
        'success', true,
        'snapshot', to_jsonb(v_new_snapshot),
        'bank_account_id', p_bank_account_id,
        'current_balance_kurus', public.fn_kasa_recalculate_bank_balance(p_bank_account_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_record_bank_daily_balance(UUID, UUID, DATE, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_record_bank_daily_balance(UUID, UUID, DATE, BIGINT, TEXT) TO service_role;

-- ============================================================================
-- 7. RPC: FN_KASA_CREATE_EXPENSE GÜNCELLEMESİ (MAAŞ GİDERİ YETKİSİ DAHİL)
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
    v_has_bank_permission BOOLEAN;
    v_has_salary_permission BOOLEAN;
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'YETKISIZ: Aktör kullanıcı belirtilmedi.';
    END IF;

    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF NOT FOUND OR v_actor.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
    END IF;

    IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'bank') THEN
        RAISE EXCEPTION 'GECERSIZ_ODEME_YONTEMI: Ödeme yöntemi cash veya bank olmalıdır.';
    END IF;

    -- Banka gideri yetki kontrolü
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
-- 8. RPC: FN_KASA_CREATE_SALE GÜNCELLEMESİ (POS BANKA ENTEGRASYONU)
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
    v_res JSONB;
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

    IF (p_service_cost_payment_status = 'paid_from_bank' OR p_service_cost_payment_source = 'bank') THEN
        IF v_actor_role <> 'yonetici' THEN
            RAISE EXCEPTION 'BANKA_ÖDEMESİ_YETKİSİZ: Bankadan maliyet ödemesi yalnız yönetici yetkisindedir.';
        END IF;
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
        'pos_bank_account_id', p_pos_bank_account_id,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_bank' THEN
        SELECT * INTO v_bank_rec FROM public.kasa_bank_accounts WHERE id = p_service_cost_bank_account_id FOR UPDATE;
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
        p_service_cost_payment_status, p_service_cost_payment_source, p_service_cost_bank_account_id,
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
    IF v_cat_name = 'Teknik Servis' AND p_service_cost_payment_status = 'paid_from_bank' AND p_service_cost_bank_account_id IS NOT NULL THEN
        INSERT INTO public.kasa_bank_transactions (
            bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
            description, related_sale_id, status, created_by_user_id
        ) VALUES (
            p_service_cost_bank_account_id, 'ts_cost_payment', 'out', p_service_cost_kurus, CURRENT_DATE,
            'Teknik Servis Maliyet Ödemesi: ' || TRIM(p_product_name) || ' (' || v_receipt_no || ')',
            v_sale_id, 'active', p_actor_user_id
        ) RETURNING id INTO v_bank_tx_id;

        PERFORM public.fn_kasa_recalculate_bank_balance(p_service_cost_bank_account_id);
    END IF;

    -- Kasa Bakiyesi Güncellemesi
    UPDATE public.kasa_days
    SET updated_at = now()
    WHERE id = p_kasa_day_id;

    v_res := jsonb_build_object(
        'id', v_sale_id,
        'sale_id', v_sale_id,
        'receipt_no', v_receipt_no,
        'kasa_day_id', p_kasa_day_id,
        'category_id', p_category_id,
        'product_name', TRIM(p_product_name),
        'quantity', p_quantity,
        'unit_price_kurus', p_unit_price_kurus,
        'total_price_kurus', p_total_price_kurus,
        'cash_paid_kurus', p_cash_paid_kurus,
        'card_paid_kurus', p_card_paid_kurus,
        'pos_bank_account_id', p_pos_bank_account_id,
        'pos_bank_tx_id', v_pos_tx_id,
        'bank_transfer_paid_kurus', p_bank_transfer_paid_kurus,
        'status', 'completed'
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'create_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;

-- Backward compatible overload (32-args calling 33-args with NULL pos_bank_account_id)
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

-- ============================================================================
-- 9. RPC: FN_KASA_CANCEL_SALE GÜNCELLEMESİ (POS VE BANKA HAREKETLERİNİ İPTAL ETME)
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

    -- Yetki kontrolü: Yönetici VEYA kendi satışı olan personel VEYA kasa.sale.cancel iznine sahip personel
    IF v_actor.role <> 'yonetici' AND v_sale.created_by_user_id <> p_actor_user_id THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.sale.cancel'
              AND is_allowed IS TRUE
              AND revoked_at IS NULL
        ) INTO v_has_permission;

        IF NOT v_has_permission THEN
            RAISE EXCEPTION 'YETKISIZ: Başka personelin satışını iptal etme yetkiniz bulunmamaktadır.';
        END IF;
    END IF;

    -- Açık gün kilidi
    v_day := public.fn_kasa_assert_active_day_for_mutation(v_sale.kasa_day_id);

    -- Satış durumunu cancelled yap
    UPDATE public.kasa_sales
    SET status = 'cancelled',
        cancelled_at = now(),
        cancelled_by_user_id = p_actor_user_id,
        cancel_justification = trim(p_justification),
        updated_at = now()
    WHERE id = p_sale_id
    RETURNING * INTO v_sale;

    -- Satış hareketini iptal hareketiyle dengele
    IF p_cancel_movements THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'iptal', v_sale.id, -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus,
            'Satış İptali: ' || v_sale.product_name || ' (' || v_sale.receipt_no || ') - Gerekçe: ' || trim(p_justification),
            p_actor_user_id
        );
    END IF;

    -- İlgili banka hareketlerini iptal et ve banka bakiyelerini yeniden hesapla (POS ve Servis Maliyeti)
    FOR v_bank_tx IN
        SELECT DISTINCT bank_account_id
        FROM public.kasa_bank_transactions
        WHERE related_sale_id = p_sale_id AND status = 'active'
    LOOP
        UPDATE public.kasa_bank_transactions
        SET status = 'cancelled', updated_at = now()
        WHERE related_sale_id = p_sale_id AND bank_account_id = v_bank_tx.bank_account_id;

        PERFORM public.fn_kasa_recalculate_bank_balance(v_bank_tx.bank_account_id);
    END LOOP;

    -- Audit log
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        p_actor_user_id, 'sale_cancelled', 'kasa_sales', p_sale_id,
        jsonb_build_object(
            'sale_id', p_sale_id,
            'receipt_no', v_sale.receipt_no,
            'total_price_kurus', v_sale.total_price_kurus,
            'pos_bank_account_id', v_sale.pos_bank_account_id
        ),
        trim(p_justification)
    );

    RETURN to_jsonb(v_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) TO service_role;

-- Backward compatible 3-args overload
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
BEGIN
    RETURN public.fn_kasa_cancel_sale(p_actor_user_id, p_sale_id, p_justification, true, NULL::text);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT) TO service_role;

-- ============================================================================
-- 10. RPC: FN_KASA_UPDATE_SALE GÜNCELLEMESİ (POS BANKA ENTEGRASYONU)
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
    v_effective_justification TEXT;
    v_updated_sale public.kasa_sales%ROWTYPE;
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

    IF COALESCE(p_card_paid_kurus, 0) > 0 THEN
        IF p_pos_bank_account_id IS NULL THEN
            RAISE EXCEPTION 'POS_BANKASI_ZORUNLU: Kredi kartı tahsilatlarında POS Bankası seçilmesi zorunludur.';
        END IF;

        SELECT * INTO v_pos_bank_rec FROM public.kasa_bank_accounts WHERE id = p_pos_bank_account_id FOR UPDATE;
        IF NOT FOUND OR v_pos_bank_rec.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'GEÇERSİZ_POS_BANKASI: Seçilen POS banka hesabı bulunamadı veya pasif.';
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
        service_cost_payment_status = p_service_cost_payment_status,
        service_cost_payment_source = p_service_cost_payment_source,
        service_cost_bank_account_id = p_service_cost_bank_account_id,
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
            'card_paid_kurus', p_card_paid_kurus
        ),
        v_effective_justification
    );

    RETURN to_jsonb(v_updated_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(UUID, UUID, UUID, TEXT, INTEGER, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, UUID, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;

-- Backward compatible 33-args overload
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
    p_justification TEXT DEFAULT NULL::text
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
