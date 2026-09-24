-- ============================================================================
-- Rollback: rollback_v22_bahar_expense_view_all.sql
-- Description: HurCELL Kasa V22 - Bahar AYDAMGA Gider Görüntüleme Yetkisini Geri Alma
-- Güvenlik: Yalnızca 'kasa.expense.view_all' yetkisini kaldırır; kasa.expense.bank ve
--           kasa.sale.cancel yetkilerine DOKUNMAZ. Finansal verileri silmez.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    c_target_uuid CONSTANT UUID := '38eca216-7235-414b-8cc3-349087a166da'::uuid;
    v_target_user public.kasa_users%ROWTYPE;
    v_admin_id UUID;
BEGIN
    -- 1. Hedef kullanıcıyı doğrula
    SELECT * INTO v_target_user
    FROM public.kasa_users
    WHERE id = c_target_uuid;

    IF v_target_user.id IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK_FAIL_CLOSED: Hedef kullanıcı bulunamadı.';
    END IF;

    -- 2. Yöneticiyi bul
    SELECT id INTO v_admin_id
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK_FAIL_CLOSED: Yönetici kullanıcı bulunamadı.';
    END IF;

    -- 3. Yalnızca 'kasa.expense.view_all' kaydını sil
    DELETE FROM public.kasa_user_permissions
    WHERE user_id = c_target_uuid
      AND permission_key = 'kasa.expense.view_all';

    -- 4. Audit Log kaydı
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        v_admin_id, 'user_permission_revoked', 'kasa_user_permissions', c_target_uuid,
        jsonb_build_object(
            'target_user_id', c_target_uuid,
            'target_username', v_target_user.username,
            'permission_key', 'kasa.expense.view_all'
        ),
        'HurCELL Kasa V22 Geri Alma - Bahar AYDAMGA Gider Görüntüleme Yetkisi Kaldırıldı'
    );
END $$;

COMMIT;
