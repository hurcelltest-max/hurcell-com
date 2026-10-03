-- ============================================================================
-- MIGRATION: V27 - Koray Kasa Hareketleri, Gider/Gelir Düzeltme & Bilanço/Kâr-Zarar Yetkileri
-- ============================================================================
-- 1. Koray SARISALTIK ('188f9002-1b23-475e-861d-78c4de0008e3') kullanıcısına:
--    - 'kasa.expense.create' (Nakit gider oluşturma)
--    - 'kasa.expense.bank' (Banka gideri oluşturma ve düzenleme)
--    - 'kasa.expense.salary.create' (Personel maaşı gideri oluşturma)
--    - 'kasa.expense.view_all' (Tüm gider ve maaşları görüntüleme)
--    - 'kasa.expense.update' (Gider düzeltme/kategori değiştirme)
--    - 'kasa.expense.cancel' (Gider iptali)
--    - 'kasa.sale.update' (Satış düzeltme)
--    - 'kasa.sale.cancel' (Satış iptali)
--    - 'kasa.bank.balance.record' (Günlük banka bakiyesi girişi)
--    - 'kasa.reports.view' (Kasa ve kâr-zarar raporlarını görüntüleme)
--    - 'kasa.balance_sheet.view' (Aylık bilanço ve finansal durum görüntüleme)
-- 2. fn_kasa_update_expense ve fn_kasa_cancel_expense fonksiyonlarının yetki kontrollerini güncelleme
-- 3. Audit loglarının eksiksiz kaydedilmesi
-- ============================================================================

BEGIN;

DO $$
DECLARE
    c_koray_uuid CONSTANT UUID := '188f9002-1b23-475e-861d-78c4de0008e3';
    v_admin_id UUID;
    v_koray public.kasa_users%ROWTYPE;
    v_perms TEXT[] := ARRAY[
        'kasa.expense.create',
        'kasa.expense.bank',
        'kasa.expense.salary.create',
        'kasa.expense.view_all',
        'kasa.expense.update',
        'kasa.expense.cancel',
        'kasa.sale.update',
        'kasa.sale.cancel',
        'kasa.bank.balance.record',
        'kasa.reports.view',
        'kasa.balance_sheet.view'
    ];
    v_perm TEXT;
BEGIN
    SELECT * INTO v_koray FROM public.kasa_users WHERE id = c_koray_uuid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Koray SARISALTIK kullanıcısı bulunamadı.';
    END IF;

    SELECT id INTO v_admin_id
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Aktif yönetici bulunamadı.';
    END IF;

    -- İzinleri tanımla
    FOREACH v_perm IN ARRAY v_perms
    LOOP
        INSERT INTO public.kasa_user_permissions (
            user_id, permission_key, is_allowed, granted_by_user_id, granted_at
        ) VALUES (
            c_koray_uuid, v_perm, true, v_admin_id, now()
        )
        ON CONFLICT (user_id, permission_key) DO UPDATE
        SET is_allowed = true, revoked_at = NULL, granted_at = now();
    END LOOP;

    -- Audit Log Kaydı
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        v_admin_id, 'user_permission_granted', 'kasa_user_permissions', c_koray_uuid,
        jsonb_build_object(
            'target_user_id', c_koray_uuid,
            'target_username', v_koray.username,
            'permissions', to_jsonb(v_perms)
        ),
        'HurCELL Kasa V27 - Koray SARISALTIK Kasa Hareketleri, Gider/Gelir Düzeltme ve Bilanço/Rapor Yetkilendirmesi'
    );
END $$;

-- ============================================================================
-- 2. RPC: FN_KASA_UPDATE_EXPENSE (YETKİ ENTEGRASYONLU)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_kasa_update_expense(
  p_actor_user_id UUID,
  p_expense_id UUID,
  p_expense_category_id UUID,
  p_amount_kurus BIGINT,
  p_description TEXT,
  p_recipient_name TEXT,
  p_justification TEXT,
  p_payment_method TEXT,
  p_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.kasa_users%ROWTYPE;
  v_exp public.kasa_expenses%ROWTYPE;
  v_day public.kasa_days%ROWTYPE;
  v_cat public.kasa_expense_categories%ROWTYPE;
  v_acc public.kasa_bank_accounts%ROWTYPE;
  v_result public.kasa_expenses%ROWTYPE;
  v_tx UUID;
  v_cash BIGINT;
  v_has_update_perm BOOLEAN;
  v_has_bank_perm BOOLEAN;
  v_has_salary_perm BOOLEAN;
BEGIN
  SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
  END IF;

  SELECT * INTO v_exp FROM public.kasa_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND OR v_exp.status <> 'active' THEN
    RAISE EXCEPTION 'GECERSIZ_GIDER';
  END IF;

  SELECT * INTO v_day FROM public.kasa_days WHERE id = v_exp.kasa_day_id FOR UPDATE;
  IF v_day.status <> 'open' THEN
    RAISE EXCEPTION 'KAPALI_GUN: Kapalı günün gideri düzeltilemez.';
  END IF;

  SELECT * INTO v_cat FROM public.kasa_expense_categories WHERE id = p_expense_category_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GECERSIZ_KATEGORI';
  END IF;

  IF p_amount_kurus <= 0 OR trim(COALESCE(p_description, '')) = '' OR trim(COALESCE(p_justification, '')) = '' THEN
    RAISE EXCEPTION 'GECERSIZ_PARAMETRE: Tutar, açıklama ve gerekçe zorunludur.';
  END IF;

  IF p_payment_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'GECERSIZ_ODEME_YONTEMI';
  END IF;

  -- Yetki Kontrolleri
  IF v_actor.role <> 'yonetici' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.kasa_user_permissions
      WHERE user_id = p_actor_user_id AND permission_key = 'kasa.expense.update' AND is_allowed IS TRUE AND revoked_at IS NULL
    ) INTO v_has_update_perm;

    SELECT EXISTS (
      SELECT 1 FROM public.kasa_user_permissions
      WHERE user_id = p_actor_user_id AND permission_key = 'kasa.expense.bank' AND is_allowed IS TRUE AND revoked_at IS NULL
    ) INTO v_has_bank_perm;

    SELECT EXISTS (
      SELECT 1 FROM public.kasa_user_permissions
      WHERE user_id = p_actor_user_id AND permission_key = 'kasa.expense.salary.create' AND is_allowed IS TRUE AND revoked_at IS NULL
    ) INTO v_has_salary_perm;

    IF NOT v_has_update_perm AND v_exp.created_by_user_id <> p_actor_user_id THEN
      RAISE EXCEPTION 'YETKISIZ: Başkasına ait gideri düzeltme yetkiniz bulunmamaktadır.';
    END IF;

    IF (v_exp.payment_method = 'bank' OR p_payment_method = 'bank') AND NOT v_has_bank_perm THEN
      RAISE EXCEPTION 'YETKISIZ: Banka gideri düzeltme yetkiniz bulunmamaktadır.';
    END IF;

    IF (v_cat.is_salary_category OR EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = v_exp.expense_category_id AND is_salary_category = true)) AND NOT v_has_salary_perm AND NOT v_has_update_perm THEN
      RAISE EXCEPTION 'YETKISIZ: Maaş gideri düzeltme yetkiniz bulunmamaktadır.';
    END IF;
  END IF;

  -- Sadece kategori/açıklama/alıcı değişiyorsa finansal ters/yeni kayıt üretme.
  IF v_exp.amount_kurus = p_amount_kurus
     AND v_exp.payment_method = p_payment_method
     AND v_exp.bank_account_id IS NOT DISTINCT FROM p_bank_account_id THEN
    UPDATE public.kasa_expenses
    SET expense_category_id = p_expense_category_id,
        description = trim(p_description),
        recipient_name = NULLIF(trim(p_recipient_name), '')
    WHERE id = p_expense_id
    RETURNING * INTO v_result;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      p_actor_user_id, 'gider_bilgileri_duzeltildi', 'kasa_expenses', p_expense_id,
      jsonb_build_object('justification', trim(p_justification), 'old_category_id', v_exp.expense_category_id,
        'new_category_id', p_expense_category_id, 'financial_effect_changed', false)
    );
    RETURN to_jsonb(v_result);
  END IF;

  -- Önce eski finansal etkiyi tersle
  IF v_exp.payment_method = 'cash' THEN
    INSERT INTO public.kasa_movements (
      kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
      v_exp.kasa_day_id, 'gider_duzeltme_iptal', v_exp.amount_kurus, v_exp.amount_kurus,
      'Gider düzeltme eski kayıt terslemesi', trim(p_justification), p_actor_user_id
    );
  ELSE
    INSERT INTO public.kasa_bank_transactions (
      bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
      description, justification, related_expense_id, status, created_by_user_id
    ) VALUES (
      v_exp.bank_account_id, 'expense_reversal', 'in', v_exp.amount_kurus, v_day.date_val,
      'Gider Düzeltme Eski Banka Ters Kaydı', trim(p_justification), v_exp.id, 'active', p_actor_user_id
    );
    PERFORM public.fn_kasa_recalculate_bank_balance(v_exp.bank_account_id);
  END IF;

  -- Yeni finansal etkiyi uygula
  IF p_payment_method = 'cash' THEN
    SELECT public.fn_kasa_get_physical_cash(v_day.id) INTO v_cash;
    IF v_cash < p_amount_kurus THEN
      RAISE EXCEPTION 'YETERSIZ_NAKIT: Kasada yeterli nakit bulunmamaktadır.';
    END IF;

    INSERT INTO public.kasa_movements (
      kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
      v_exp.kasa_day_id, 'gider_duzeltme_yeni', -p_amount_kurus, -p_amount_kurus,
      'Gider düzeltme yeni kayıt', trim(p_justification), p_actor_user_id
    );
    v_tx := NULL;
  ELSE
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI: Banka ödemesi için hesap seçilmelidir.';
    END IF;

    SELECT * INTO v_acc FROM public.kasa_bank_accounts WHERE id = p_bank_account_id AND is_active = true FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GECERSIZ_BANKA_HESABI';
    END IF;

    INSERT INTO public.kasa_bank_transactions (
      bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
      description, justification, related_expense_id, status, created_by_user_id
    ) VALUES (
      p_bank_account_id, 'expense_payment', 'out', p_amount_kurus, v_day.date_val,
      'Gider Düzeltme Yeni Banka Çıkışı: ' || trim(p_description), trim(p_justification), v_exp.id, 'active', p_actor_user_id
    )
    RETURNING id INTO v_tx;

    PERFORM public.fn_kasa_recalculate_bank_balance(p_bank_account_id);
  END IF;

  UPDATE public.kasa_expenses
  SET expense_category_id = p_expense_category_id,
      amount_kurus = p_amount_kurus,
      description = trim(p_description),
      recipient_name = NULLIF(trim(p_recipient_name), ''),
      payment_method = p_payment_method,
      bank_account_id = CASE WHEN p_payment_method = 'bank' THEN p_bank_account_id ELSE NULL END,
      bank_transaction_id = v_tx
  WHERE id = p_expense_id
  RETURNING * INTO v_result;

  INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_actor_user_id, 'gider_duzeltildi', 'kasa_expenses', p_expense_id,
    jsonb_build_object(
      'justification', trim(p_justification),
      'old_amount_kurus', v_exp.amount_kurus,
      'new_amount_kurus', p_amount_kurus,
      'old_payment_method', v_exp.payment_method,
      'new_payment_method', p_payment_method,
      'financial_effect_changed', true
    )
  );

  RETURN to_jsonb(v_result);
END;
$$;

-- ============================================================================
-- 3. RPC: FN_KASA_CANCEL_EXPENSE (YETKİ ENTEGRASYONLU)
-- ============================================================================
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
  v_exp public.kasa_expenses%ROWTYPE;
  v_day public.kasa_days%ROWTYPE;
  v_result public.kasa_expenses%ROWTYPE;
  v_has_cancel_perm BOOLEAN;
  v_has_bank_perm BOOLEAN;
  v_has_salary_perm BOOLEAN;
BEGIN
  SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YETKISIZ: Aktif kullanıcı bulunamadı.';
  END IF;

  IF p_justification IS NULL OR trim(p_justification) = '' THEN
    RAISE EXCEPTION 'GEREKCE_ZORUNLU';
  END IF;

  SELECT * INTO v_exp FROM public.kasa_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND OR v_exp.status <> 'active' THEN
    RAISE EXCEPTION 'GECERSIZ_GIDER';
  END IF;

  -- Yetki Kontrolleri
  IF v_actor.role <> 'yonetici' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.kasa_user_permissions
      WHERE user_id = p_actor_user_id AND permission_key = 'kasa.expense.cancel' AND is_allowed IS TRUE AND revoked_at IS NULL
    ) INTO v_has_cancel_perm;

    SELECT EXISTS (
      SELECT 1 FROM public.kasa_user_permissions
      WHERE user_id = p_actor_user_id AND permission_key = 'kasa.expense.bank' AND is_allowed IS TRUE AND revoked_at IS NULL
    ) INTO v_has_bank_perm;

    SELECT EXISTS (
      SELECT 1 FROM public.kasa_user_permissions
      WHERE user_id = p_actor_user_id AND permission_key = 'kasa.expense.salary.create' AND is_allowed IS TRUE AND revoked_at IS NULL
    ) INTO v_has_salary_perm;

    IF NOT v_has_cancel_perm AND v_exp.created_by_user_id <> p_actor_user_id THEN
      RAISE EXCEPTION 'YETKISIZ: Başkasına ait gideri iptal etme yetkiniz bulunmamaktadır.';
    END IF;

    IF v_exp.payment_method = 'bank' AND NOT v_has_bank_perm AND NOT v_has_cancel_perm THEN
      RAISE EXCEPTION 'YETKISIZ: Banka gideri iptal yetkiniz bulunmamaktadır.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = v_exp.expense_category_id AND is_salary_category = true) AND NOT v_has_salary_perm AND NOT v_has_cancel_perm THEN
      RAISE EXCEPTION 'YETKISIZ: Maaş gideri iptal yetkiniz bulunmamaktadır.';
    END IF;
  END IF;

  SELECT * INTO v_day FROM public.kasa_days WHERE id = v_exp.kasa_day_id FOR UPDATE;
  IF v_day.status <> 'open' THEN
    RAISE EXCEPTION 'KAPALI_GUN: Kapalı günün gideri iptal edilemez.';
  END IF;

  IF v_exp.payment_method = 'cash' THEN
    INSERT INTO public.kasa_movements (
      kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
      v_exp.kasa_day_id, 'gider_iptal', v_exp.amount_kurus, v_exp.amount_kurus,
      'Nakit gider iptal ters kaydı', trim(p_justification), p_actor_user_id
    );
  ELSE
    INSERT INTO public.kasa_bank_transactions (
      bank_account_id, transaction_type, direction, amount_kurus, transaction_date,
      description, justification, related_expense_id, status, created_by_user_id
    ) VALUES (
      v_exp.bank_account_id, 'expense_reversal', 'in', v_exp.amount_kurus, v_day.date_val,
      'Gider Ödemesi İptal Ters Kaydı', trim(p_justification), v_exp.id, 'active', p_actor_user_id
    );
    PERFORM public.fn_kasa_recalculate_bank_balance(v_exp.bank_account_id);
  END IF;

  UPDATE public.kasa_expenses
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_user_id = p_actor_user_id,
      cancel_reason = trim(p_justification)
  WHERE id = p_expense_id
  RETURNING * INTO v_result;

  INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_actor_user_id, 'gider_iptal_edildi', 'kasa_expenses', p_expense_id,
    jsonb_build_object('justification', trim(p_justification), 'payment_method', v_exp.payment_method, 'amount_kurus', v_exp.amount_kurus)
  );

  RETURN to_jsonb(v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_update_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_expense(UUID, UUID, TEXT) TO service_role;

COMMIT;
