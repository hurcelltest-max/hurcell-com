-- Migration: 20260828150000_kasa_staff_expense_cancel_v1.sql
-- Description: Allow staff to soft-cancel their own non-salary active expenses on open days with mandatory justification

BEGIN;

-- 1. Ensure status column default and handle any legacy NULL status records safely
UPDATE public.kasa_expenses 
SET status = 'active' 
WHERE status IS NULL;

ALTER TABLE public.kasa_expenses 
ALTER COLUMN status SET DEFAULT 'active';

-- 2. Secure RPC function for Expense Cancellation
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
    v_expense public.kasa_expenses%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_category public.kasa_expense_categories%ROWTYPE;
    v_cancelled_expense public.kasa_expenses%ROWTYPE;
    v_trimmed_justification TEXT;
    v_rows_updated INT;
BEGIN
    -- 1. Actor Check
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    -- 2. Justification Check (trim, min 3 chars, max 500 chars)
    v_trimmed_justification := trim(COALESCE(p_justification, ''));
    IF char_length(v_trimmed_justification) < 3 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider iptal gerekçesi en az 3 karakter olmalıdır.';
    END IF;
    IF char_length(v_trimmed_justification) > 500 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider iptal gerekçesi en fazla 500 karakter olabilir.';
    END IF;

    -- 3. Lock Expense with FOR UPDATE (Serializes concurrent requests)
    SELECT * INTO v_expense FROM public.kasa_expenses WHERE id = p_expense_id FOR UPDATE;
    IF v_expense.id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gider kaydı bulunamadı.';
    END IF;
    IF v_expense.status IS NULL OR v_expense.status <> 'active' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gider kaydı aktif durumda değil (zaten iptal edilmiş).';
    END IF;

    -- 4. Lock Day with FOR UPDATE
    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_expense.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kapanmış güne ait giderler iptal edilemez.';
    END IF;

    -- 5. Category Check
    SELECT * INTO v_category FROM public.kasa_expense_categories WHERE id = v_expense.expense_category_id;
    IF v_category.id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Gider kategorisi bulunamadı.';
    END IF;

    -- 6. Role & Ownership Permission Matrix
    IF v_actor.role = 'yonetici' THEN
        -- Manager can cancel any active expense on open day
        NULL;
    ELSIF v_actor.role = 'personel' THEN
        IF v_expense.created_by_user_id <> p_actor_user_id THEN
            RAISE EXCEPTION 'YETKİSİZ: Personel yalnızca kendi oluşturduğu günlük giderleri iptal edebilir.';
        END IF;

        IF v_category.is_salary_category = true THEN
            RAISE EXCEPTION 'YETKİSİZ: Personel maaşı kayıtları yalnızca yöneticiler tarafından iptal edilebilir.';
        END IF;
    ELSE
        RAISE EXCEPTION 'YETKİSİZ: İptal yetkisi bulunmamaktadır.';
    END IF;

    -- 7. Soft Cancel Expense Record (Atomic conditional update for idempotency)
    UPDATE public.kasa_expenses SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by_user_id = p_actor_user_id,
        cancel_reason = v_trimmed_justification
    WHERE id = p_expense_id AND status = 'active'
    RETURNING * INTO v_cancelled_expense;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 OR v_cancelled_expense.id IS NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gider kaydı zaten iptal edilmiş veya aktif değil.';
    END IF;

    -- 8. Add Single Reversal Movement
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_expense.kasa_day_id, 'gider_iptal', v_expense.sale_id, v_expense.amount_kurus, v_expense.amount_kurus, 0,
        'Gider İptali (' || COALESCE(v_category.name, 'Gider') || '): ' || v_trimmed_justification, p_actor_user_id
    );

    -- 9. Audit Log
    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'gider_iptal_edildi', 'kasa_expenses', p_expense_id, jsonb_build_object(
        'amount_kurus', v_expense.amount_kurus,
        'category_name', COALESCE(v_category.name, 'Gider'),
        'justification', v_trimmed_justification,
        'actor_role', v_actor.role
    ));

    RETURN to_jsonb(v_cancelled_expense);
END;
$$;

-- 3. Strict Function Permissions
REVOKE ALL ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) TO service_role;

COMMIT;
