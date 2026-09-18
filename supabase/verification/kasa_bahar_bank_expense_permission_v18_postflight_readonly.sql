-- ============================================================================
-- Verification: kasa_bahar_bank_expense_permission_v18_postflight_readonly.sql
-- Description: HurCELL Kasa V18 Postflight Salt-Okunur Doğrulama Sorgusu
--              - Bahar AYDAMGA kullanıcısı ve kasa.expense.bank yetkisi kontrolü
--              - fn_kasa_create_expense 10-parametreli sözleşme ve kaynak kod kontrolleri
--              - public.kasa_audit_logs kanonik INSERT sözleşmesi doğrulaması
--              - Negatif kontroller: kasa_day_id, target_entity, target_id sütunlarının bulunmaması
--              - NULL-safe karşılaştırmalar (IS DISTINCT FROM, IS NOT TRUE)
--              - Aktif TRY banka hesapları listesi ve bakiye durumu raporlaması
--              - overall_ok doğrulama bayrağı
-- KESİN SINIR: Yalnızca SELECT çalıştırır. Asla INSERT/UPDATE/DELETE/DDL içermez.
-- ============================================================================

WITH target_user_check AS (
    SELECT
        COUNT(*) = 1 AS user_exists,
        bool_and(username IS NOT DISTINCT FROM 'bahar') AS username_is_bahar,
        bool_and(full_name IS NOT DISTINCT FROM 'Bahar AYDAMGA') AS fullname_is_bahar,
        bool_and(role IS NOT DISTINCT FROM 'personel') AS role_is_personel,
        bool_and(is_active IS TRUE) AS is_active
    FROM public.kasa_users
    WHERE id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
),
permission_check AS (
    SELECT
        COUNT(*) = 1 AS permission_exists,
        bool_and(is_allowed IS TRUE) AS is_allowed,
        bool_and(revoked_at IS NULL) AS is_not_revoked
    FROM public.kasa_user_permissions
    WHERE user_id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
      AND permission_key = 'kasa.expense.bank'
),
permission_audit_check AS (
    SELECT
        COUNT(*) >= 1 AS permission_audit_exists
    FROM public.kasa_audit_logs
    WHERE entity_type = 'kasa_user_permissions'
      AND entity_id = '38eca216-7235-414b-8cc3-349087a166da'::uuid
      AND action = 'user_permission_granted'
),
rpc_signature_check AS (
    SELECT
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS args,
        p.prosecdef AS is_security_definer,
        pg_get_functiondef(p.oid) AS func_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_kasa_create_expense'
),
rpc_analysis AS (
    SELECT
        COUNT(*) = 1 AS rpc_exists,
        bool_and(is_security_definer = true) AS is_security_definer,
        bool_and(args = 'p_actor_user_id uuid, p_kasa_day_id uuid, p_expense_category_id uuid, p_amount_kurus bigint, p_description text, p_recipient_name text, p_sale_id uuid, p_payment_method text, p_bank_account_id uuid, p_idempotency_key text') AS signature_10_args_match,
        bool_and(func_def ILIKE '%kasa.expense.bank%') AS checks_bank_permission,
        bool_and(func_def ILIKE '%fn_kasa_recalculate_bank_balance%') AS recalculates_bank_balance,
        -- Kanonik audit insert kolonları kontrolü
        bool_and(func_def ILIKE '%INSERT INTO public.kasa_audit_logs%user_id%action%entity_type%entity_id%details%justification%') AS audit_insert_canonical,
        bool_and(func_def ILIKE '%justification%') AS audit_insert_has_justification,
        -- Negatif kontroller: eski/hatalı kolonlar fn_kasa_create_expense içinde olmamalı
        bool_and(func_def NOT ILIKE '%INSERT INTO public.kasa_audit_logs%(%kasa_day_id%target_entity%target_id%)%') AS no_invalid_audit_columns,
        -- NULL safety kontrolleri
        bool_and(func_def ILIKE '%IS DISTINCT FROM%') AS has_null_safe_comparisons,
        bool_and(func_def ILIKE '%IS NOT TRUE%') AS has_null_safe_booleans
    FROM rpc_signature_check
),
bank_accounts_summary AS (
    SELECT
        COUNT(*) AS active_try_account_count,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'account_name', account_name,
                    'bank_name', bank_name,
                    'currency_code', currency_code,
                    'current_balance_kurus', current_balance_kurus
                ) ORDER BY account_name
            ),
            '[]'::jsonb
        ) AS active_try_accounts
    FROM public.kasa_bank_accounts
    WHERE is_active = true
      AND currency_code = 'TRY'
)
SELECT
    -- Hedef Kullanıcı & Yetki Durumu
    tu.user_exists,
    tu.username_is_bahar,
    tu.fullname_is_bahar,
    tu.role_is_personel,
    tu.is_active AS user_active,
    perm.permission_exists,
    perm.is_allowed AS permission_is_allowed,
    perm.is_not_revoked AS permission_not_revoked,
    pa.permission_audit_exists,
    -- RPC Sözleşme ve Güvenlik Durumu
    rpc.rpc_exists,
    rpc.is_security_definer,
    rpc.signature_10_args_match,
    rpc.checks_bank_permission,
    rpc.recalculates_bank_balance,
    rpc.audit_insert_canonical,
    rpc.audit_insert_has_justification,
    rpc.no_invalid_audit_columns,
    rpc.has_null_safe_comparisons,
    rpc.has_null_safe_booleans,
    -- Aktif TRY Banka Hesapları Özeti
    ba.active_try_account_count,
    ba.active_try_accounts,
    -- GENEL DOĞRULAMA (OVERALL OK)
    (
        tu.user_exists
        AND tu.username_is_bahar
        AND tu.fullname_is_bahar
        AND tu.role_is_personel
        AND tu.is_active
        AND perm.permission_exists
        AND perm.is_allowed
        AND perm.is_not_revoked
        AND pa.permission_audit_exists
        AND rpc.rpc_exists
        AND rpc.is_security_definer
        AND rpc.signature_10_args_match
        AND rpc.checks_bank_permission
        AND rpc.recalculates_bank_balance
        AND rpc.audit_insert_canonical
        AND rpc.audit_insert_has_justification
        AND rpc.no_invalid_audit_columns
        AND rpc.has_null_safe_comparisons
        AND rpc.has_null_safe_booleans
    ) AS overall_ok
FROM target_user_check tu
CROSS JOIN permission_check perm
CROSS JOIN permission_audit_check pa
CROSS JOIN rpc_analysis rpc
CROSS JOIN bank_accounts_summary ba;
