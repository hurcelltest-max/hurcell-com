-- EMERGENCY ROLLBACK ONLY. Do not run during normal V18 installation.
-- Restores the function from the user-supplied live preflight, 2026-09-18.
-- Preflight showed no kasa.expense.bank row for Bahar.
-- Does not delete financial records or alter kasa.sale.cancel.
-- Restores the previous function behaviour, including its existing limitations.

BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_kasa_create_expense') <> 1
     OR to_regprocedure('public.fn_kasa_create_expense(uuid, uuid, uuid, bigint, text, text, uuid, text, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: Expected exactly the canonical expense function.';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.fn_kasa_create_expense(p_actor_user_id uuid, p_kasa_day_id uuid, p_expense_category_id uuid, p_amount_kurus bigint, p_description text, p_recipient_name text, p_sale_id uuid, p_payment_method text, p_bank_account_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_expense(uuid, uuid, uuid, bigint, text, text, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_expense(uuid, uuid, uuid, bigint, text, text, uuid, text, uuid, text) TO service_role;

-- Remove only the grant introduced by this specific V18 migration.
-- Abort if another grant has replaced it, to avoid undoing a later decision.
DO $permission$
DECLARE
  v_perm public.kasa_user_permissions%ROWTYPE;
BEGIN
  SELECT * INTO v_perm FROM public.kasa_user_permissions
  WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
    AND permission_key = 'kasa.expense.bank' FOR UPDATE;

  IF FOUND THEN
    IF v_perm.is_allowed IS NOT TRUE OR v_perm.revoked_at IS NOT NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.kasa_audit_logs a
         WHERE a.action = 'user_permission_granted'
           AND a.entity_type = 'kasa_user_permissions'
           AND a.entity_id = v_perm.user_id
           AND a.justification = 'HurCELL Kasa V18 - Bahar AYDAMGA Banka Gideri Giriş Yetkisi Tanımlandı'
           AND a.created_at = v_perm.granted_at
       ) THEN
      RAISE EXCEPTION 'ROLLBACK_ABORT: Permission does not match the original V18 grant.';
    END IF;

    DELETE FROM public.kasa_user_permissions
    WHERE id = v_perm.id;
  END IF;
END;
$permission$;

COMMIT;
