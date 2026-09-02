-- ============================================================================
-- Migration: 20260902190000_kasa_sale_cancel_schema_fix_v13.sql
-- Description: HurCELL Kasa V13 - Satış İptal Fonksiyonu Şema Uyumluluk Düzeltmesi
--              (kasa_sales tablosunda bulunmayan updated_at yazımının kaldırılması)
-- Güvenlik: Fail-closed transaction, SECURITY DEFINER, search_path = public, pg_temp,
--           REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT TO service_role only.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. KANONİK 5-PARAMETRELİ FN_KASA_CANCEL_SALE FONKSİYONU (ŞEMA DÜZELTMESİ)
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
    v_bank_tx public.kasa_bank_transactions%ROWTYPE;
    v_account public.credit_accounts%ROWTYPE;
    v_uncollected_credit BIGINT;
    v_new_balance NUMERIC;
    v_trans_code TEXT;
    v_cancelled_sale public.kasa_sales%ROWTYPE;
    v_payload JSONB;
    v_cached JSONB;
    v_res JSONB;
    v_has_permission BOOLEAN;
BEGIN
    -- 1. Kullanıcı Doğrulama ve Aktiflik Kontrolü
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_KULLANICI: İşlemi yapan kullanıcı bulunamadı veya pasif durumda.';
    END IF;

    -- 2. Yetki Kontrolü: Yönetici VEYA aktif 'kasa.sale.cancel' iznine sahip personel
    IF v_actor.role <> 'yonetici' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.kasa_user_permissions
            WHERE user_id = p_actor_user_id
              AND permission_key = 'kasa.sale.cancel'
              AND is_allowed = true
              AND revoked_at IS NULL
        ) INTO v_has_permission;

        IF NOT v_has_permission THEN
            RAISE EXCEPTION 'YETKİSİZ_İŞLEM: Satış iptali yetkisi yalnızca yöneticilere ve yetkilendirilmiş personele aittir.';
        END IF;
    END IF;

    -- 3. Gerekçe Kontrolü
    IF p_justification IS NULL OR TRIM(p_justification) = '' OR length(TRIM(p_justification)) < 3 THEN
        RAISE EXCEPTION 'GEREKÇE_ZORUNLU: Satış iptali için geçerli bir gerekçe (en az 3 karakter) belirtilmelidir.';
    END IF;

    -- 4. Satış Kaydını Kilitle ve Doğrula
    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_SATIŞ: İptal edilecek tamamlanmış satış bulunamadı veya satış zaten iptal edilmiş.';
    END IF;

    -- 5. Kronolojik Gün ve Açık Gün Kilidi (V11)
    v_day := public.fn_kasa_assert_active_day_for_mutation(v_sale.kasa_day_id);

    -- 6. Idempotency Kontrolü
    v_payload := jsonb_build_object(
        'sale_id', p_sale_id,
        'justification', TRIM(p_justification),
        'cancel_movements', COALESCE(p_cancel_movements, true)
    );

    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        v_cached := public.fn_kasa_check_idempotency(p_actor_user_id, p_idempotency_key, v_payload);
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- 7. Cari Satış İptali Reversal İşlemleri (Eğer cari satış ise)
    IF v_sale.credit_customer_id IS NOT NULL AND v_sale.uncollected_credit_kurus > 0 THEN
        SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = v_sale.credit_customer_id FOR UPDATE;
        IF v_account.id IS NOT NULL THEN
            v_uncollected_credit := v_sale.uncollected_credit_kurus;
            v_new_balance := GREATEST(v_account.current_balance - (v_uncollected_credit / 100.0), 0);

            UPDATE public.credit_accounts
            SET current_balance = v_new_balance, updated_at = now()
            WHERE id = v_account.id;

            v_trans_code := 'REV-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

            INSERT INTO public.credit_transactions (
                transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
                amount, description, source_type, source_reference, admin_username, balance_after
            ) VALUES (
                v_trans_code, v_sale.credit_customer_id, v_account.id, 'reversal', 'credit',
                (v_uncollected_credit / 100.0), 'Kasa Satış İptali: ' || v_sale.receipt_no || ' (Gerekçe: ' || TRIM(p_justification) || ')',
                'reversal', v_sale.id::text, v_actor.username, v_new_balance
            );
        END IF;
    END IF;

    -- 8. Bankadan Ödenen TS Maliyet Kaydının İptali (Eğer varsa)
    SELECT * INTO v_bank_tx FROM public.kasa_bank_transactions
    WHERE related_sale_id = p_sale_id AND transaction_type = 'ts_cost_payment' AND status = 'active'
    FOR UPDATE;

    IF v_bank_tx.id IS NOT NULL THEN
        UPDATE public.kasa_bank_transactions
        SET status = 'cancelled', updated_at = now()
        WHERE id = v_bank_tx.id;

        PERFORM public.fn_kasa_recalculate_bank_balance(v_bank_tx.bank_account_id);
    END IF;

    -- 9. Satış Durumunu 'cancelled' Olarak Güncelle (Şemada bulunmayan updated_at kaldırıldı)
    UPDATE public.kasa_sales SET
        status = 'cancelled',
        description = COALESCE(description, '') || ' [İPTAL: ' || TRIM(p_justification) || ']',
        uncollected_credit_kurus = 0,
        uncollected_cost_kurus = 0
    WHERE id = p_sale_id
    RETURNING * INTO v_cancelled_sale;

    -- 10. Kasa Hareket Kaydı (Satış İptali Ters Kaydı)
    IF COALESCE(p_cancel_movements, true) THEN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'iptal', p_sale_id, -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus, -v_sale.bank_transfer_paid_kurus,
            'Satış İptali (' || v_sale.receipt_no || '): ' || TRIM(p_justification), p_actor_user_id
        );
    END IF;

    -- 11. Audit Log Kaydı
    INSERT INTO public.kasa_audit_logs (
        user_id, action, entity_type, entity_id, details, justification
    ) VALUES (
        p_actor_user_id, 'satis_iptal_edildi', 'kasa_sales', p_sale_id,
        jsonb_build_object(
            'receipt_no', v_sale.receipt_no,
            'total_price_kurus', v_sale.total_price_kurus,
            'cancelled_bank_tx_id', v_bank_tx.id
        ),
        TRIM(p_justification)
    );

    v_res := to_jsonb(v_cancelled_sale);

    -- 12. Idempotency Kaydı
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        PERFORM public.fn_kasa_save_idempotency(p_actor_user_id, p_idempotency_key, 'cancel_sale', v_payload, v_res);
    END IF;

    RETURN v_res;
END;
$$;

-- ============================================================================
-- 2. ACL VE GÜVENLİK SIKILAŞTIRMASI (TEKİL 5-PARAMETRELİ KANONİK İMZA)
-- ============================================================================
REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT, BOOLEAN, TEXT) TO service_role;

COMMIT;
