-- ============================================================================
-- EMERGENCY ROLLBACK ONLY: rollback_v23_bank_pos_salary.sql
-- Reverts V23 changes safely.
-- ============================================================================

BEGIN;

-- 1. Remove permissions granted to Bahar in V23
DELETE FROM public.kasa_user_permissions
WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'
  AND permission_key IN ('kasa.bank.balance.record', 'kasa.expense.salary.create');

-- 2. Drop RPCs added in V23
DROP FUNCTION IF EXISTS public.fn_kasa_record_bank_daily_balance(UUID, UUID, DATE, BIGINT, TEXT);

-- 3. Drop table kasa_bank_daily_snapshots
DROP TABLE IF EXISTS public.kasa_bank_daily_snapshots CASCADE;

-- 4. Restore previous canonical functions (from V18 & V16)
-- (Restores fn_kasa_create_expense from V18)
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

    v_day := public.fn_kasa_assert_active_day_for_mutation(p_kasa_day_id);

    SELECT * INTO v_cat FROM public.kasa_expense_categories WHERE id = p_expense_category_id;
    IF NOT FOUND OR v_cat.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'GECERSIZ_KATEGORI: Gider kategorisi bulunamadı veya pasif.';
    END IF;

    IF v_cat.is_salary_category IS TRUE AND v_actor.role IS DISTINCT FROM 'yonetici' THEN
        RAISE EXCEPTION 'YETKISIZ: Maaş giderini yalnız yönetici kaydedebilir.';
    END IF;

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
            CASE WHEN v_cat.is_salary_category IS TRUE THEN 'salary_payment' ELSE 'nakit_gider' END,
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

    RETURN to_jsonb(v_exp);
END;
$$;

COMMIT;
