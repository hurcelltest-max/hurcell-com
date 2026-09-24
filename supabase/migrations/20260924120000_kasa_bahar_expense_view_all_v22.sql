-- ============================================================================
-- Migration: 20260924120000_kasa_bahar_expense_view_all_v22.sql
-- Description: HurCELL Kasa V22 - Bahar AYDAMGA Tüm Kasa Giderlerini Görüntüleme Yetkilendirmesi (kasa.expense.view_all)
-- Güvenlik: Fail-closed transaction, audit logging, personel rolü ve mevcut yetkiler (kasa.expense.bank, kasa.sale.cancel) korunur.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    c_target_uuid CONSTANT UUID := '38eca216-7235-414b-8cc3-349087a166da'::uuid;
    v_target_user public.kasa_users%ROWTYPE;
    v_admin_id UUID;
BEGIN
    -- 1. Hedef kullanıcının UUID, username, full_name, role ve aktifliğini kesin olarak doğrula (NULL-safe & Fail-closed)
    SELECT * INTO v_target_user
    FROM public.kasa_users
    WHERE id = c_target_uuid;

    IF v_target_user.id IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Hedef kullanıcı UUID (%) bulunamadı.', c_target_uuid;
    END IF;

    IF v_target_user.username IS DISTINCT FROM 'bahar' OR v_target_user.full_name IS DISTINCT FROM 'Bahar AYDAMGA' THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Kullanıcı kimlik bilgileri uyuşmuyor (Beklenen: bahar / Bahar AYDAMGA, Mevcut: % / %).', v_target_user.username, v_target_user.full_name;
    END IF;

    IF v_target_user.role IS DISTINCT FROM 'personel' THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Hedef kullanıcının rolü personel olmalıdır (Mevcut: %).', v_target_user.role;
    END IF;

    IF v_target_user.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Hedef kullanıcı aktif durumda değildir.';
    END IF;

    -- 2. Yetkilendiren yönetici kullanıcısını bul
    SELECT id INTO v_admin_id
    FROM public.kasa_users
    WHERE role = 'yonetici' AND is_active IS TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_FAIL_CLOSED: Yetkilendirme yapacak aktif yönetici kullanıcı bulunamadı.';
    END IF;

    -- 3. Bahar kullanıcısına 'kasa.expense.view_all' yetkisi tanımla (Rolü personel olarak kalır)
    INSERT INTO public.kasa_user_permissions (
        user_id, permission_key, is_allowed, granted_by_user_id, granted_at, revoked_at
    ) VALUES (
        c_target_uuid, 'kasa.expense.view_all', true, v_admin_id, now(), NULL
    )
    ON CONFLICT (user_id, permission_key) DO UPDATE
    SET is_allowed = true, revoked_at = NULL, granted_at = now();

    -- 4. Audit Log kaydı (Kanonik şema: user_id, action, entity_type, entity_id, details, justification)
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        v_admin_id, 'user_permission_granted', 'kasa_user_permissions', c_target_uuid,
        jsonb_build_object(
            'target_user_id', c_target_uuid,
            'target_username', v_target_user.username,
            'target_full_name', v_target_user.full_name,
            'target_role', v_target_user.role,
            'permission_key', 'kasa.expense.view_all'
        ),
        'HurCELL Kasa V22 - Bahar AYDAMGA Tüm Kasa Giderlerini Görüntüleme Yetkisi Tanımlandı'
    );
END $$;

COMMIT;
