-- Migration: 20260826100000_kasa_day_chain_and_ledger_v3.sql
-- Description: HurCELL Kasa System v3 - Strict DB-level Sequential Day Chain, Fail-Fast Movement Constraint Check, Immediate Previous Source Validation & Real Column References

BEGIN;

-- 1. FAIL-FAST KONTROLLERİ
DO $$
DECLARE
    v_dup_days INT;
    v_dup_acilis INT;
    v_dup_repair INT;
    v_dup_kapanis INT;
    v_invalid_type TEXT;
BEGIN
    SELECT COUNT(*) INTO v_dup_days FROM (
        SELECT date_val FROM public.kasa_days GROUP BY date_val HAVING COUNT(*) > 1
    ) d;
    IF v_dup_days > 0 THEN
        RAISE EXCEPTION 'MÜKERRER_GÜN_VAR: kasa_days tablosunda aynı tarihe ait % adet mükerrer gün kaydı bulundu! Migration durduruldu.', v_dup_days;
    END IF;

    SELECT COUNT(*) INTO v_dup_acilis FROM (
        SELECT kasa_day_id FROM public.kasa_movements WHERE movement_type = 'acilis_bakiyesi' GROUP BY kasa_day_id HAVING COUNT(*) > 1
    ) a;
    IF v_dup_acilis > 0 THEN
        RAISE EXCEPTION 'MÜKERRER_AÇILIŞ_VAR: kasa_movements tablosunda mükerrer acilis_bakiyesi kaydı bulundu! Migration durduruldu.', v_dup_acilis;
    END IF;

    SELECT COUNT(*) INTO v_dup_repair FROM (
        SELECT kasa_day_id FROM public.kasa_movements WHERE movement_type = 'carryover_repair' GROUP BY kasa_day_id HAVING COUNT(*) > 1
    ) r;
    IF v_dup_repair > 0 THEN
        RAISE EXCEPTION 'MÜKERRER_ONARIM_VAR: kasa_movements tablosunda mükerrer carryover_repair kaydı bulundu! Migration durduruldu.', v_dup_repair;
    END IF;

    SELECT COUNT(*) INTO v_dup_kapanis FROM (
        SELECT kasa_day_id FROM public.kasa_movements WHERE movement_type = 'gun_sonu_kapanis' GROUP BY kasa_day_id HAVING COUNT(*) > 1
    ) k;
    IF v_dup_kapanis > 0 THEN
        RAISE EXCEPTION 'MÜKERRER_KAPANIŞ_VAR: kasa_movements tablosunda mükerrer gun_sonu_kapanis kaydı bulundu! Migration durduruldu.', v_dup_kapanis;
    END IF;

    -- Mevcut kasa_movements tablosundaki bütün movement_type değerlerini yeni constraint öncesi doğrula
    SELECT movement_type INTO v_invalid_type
    FROM public.kasa_movements
    WHERE movement_type NOT IN (
        'satis', 'nakit_tahsilat', 'kredi_karti_tahsilat', 'bank_transfer_tahsilat', 'nakit_gider', 'iade', 'iptal', 'acilis_bakiyesi', 'gun_sonu_kapanis',
        'capital_injection', 'owner_withdrawal', 'cash_carry_forward', 'salary_payment', 'technical_service_revenue',
        'technical_service_expense', 'inventory_purchase', 'bank_deposit', 'fx_sale_payment', 'fx_capital_injection',
        'fx_conversion_to_try', 'fx_bank_deposit', 'fx_return', 'credit_tahsilat', 'satis_duzeltme_iptal', 'satis_duzeltme_yeni',
        'gider_duzeltme_iptal', 'gider_duzeltme_yeni', 'gider_iptal', 'ts_cost_cash_payment', 'ts_cost_cash_refund', 'carryover_repair'
    )
    LIMIT 1;

    IF v_invalid_type IS NOT NULL THEN
        RAISE EXCEPTION 'GEÇERSİZ_HAREKET_TÜRÜ: kasa_movements tablosunda izin verilmeyen hareket türü bulundu: %! Migration durduruldu.', v_invalid_type;
    END IF;
END $$;

-- 2. Tablo Kolon ve İndeks Güncellemeleri
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS has_no_cost BOOLEAN DEFAULT false;
ALTER TABLE public.kasa_days ADD COLUMN IF NOT EXISTS is_opening_repaired BOOLEAN DEFAULT false;
ALTER TABLE public.kasa_days ADD COLUMN IF NOT EXISTS repair_note TEXT;

-- Tarih Benzersizlik İndeksi
CREATE UNIQUE INDEX IF NOT EXISTS idx_kasa_days_date_val ON public.kasa_days(date_val);

-- kasa_movements movement_type CHECK kısıtlaması
ALTER TABLE public.kasa_movements DROP CONSTRAINT IF EXISTS chk_kasa_movements_type;
ALTER TABLE public.kasa_movements ADD CONSTRAINT chk_kasa_movements_type CHECK (movement_type IN (
    'satis', 'nakit_tahsilat', 'kredi_karti_tahsilat', 'bank_transfer_tahsilat', 'nakit_gider', 'iade', 'iptal', 'acilis_bakiyesi', 'gun_sonu_kapanis',
    'capital_injection', 'owner_withdrawal', 'cash_carry_forward', 'salary_payment', 'technical_service_revenue',
    'technical_service_expense', 'inventory_purchase', 'bank_deposit', 'fx_sale_payment', 'fx_capital_injection',
    'fx_conversion_to_try', 'fx_bank_deposit', 'fx_return', 'credit_tahsilat', 'satis_duzeltme_iptal', 'satis_duzeltme_yeni',
    'gider_duzeltme_iptal', 'gider_duzeltme_yeni', 'gider_iptal', 'ts_cost_cash_payment', 'ts_cost_cash_refund', 'carryover_repair'
));

-- Partial Unique Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_kasa_movements_unique_acilis ON public.kasa_movements (kasa_day_id) WHERE movement_type = 'acilis_bakiyesi';
CREATE UNIQUE INDEX IF NOT EXISTS idx_kasa_movements_unique_repair ON public.kasa_movements (kasa_day_id) WHERE movement_type = 'carryover_repair';
CREATE UNIQUE INDEX IF NOT EXISTS idx_kasa_movements_unique_kapanis ON public.kasa_movements (kasa_day_id) WHERE movement_type = 'gun_sonu_kapanis';


-- 3. GERÇEK KOLONLARLA VE TARİH SIRASI KONTROLÜYLE GÜN SONU KAPANIS RPC'Sİ (fn_kasa_close_day)
CREATE OR REPLACE FUNCTION public.fn_kasa_close_day(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_counted_cash_kurus BIGINT,
    p_closing_note TEXT DEFAULT NULL,
    p_counted_usd_cents BIGINT DEFAULT NULL,
    p_counted_eur_cents BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_expected_cash BIGINT := 0;
    v_cash_diff BIGINT := 0;
    v_usd_diff BIGINT := 0;
    v_eur_diff BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Gün sonu kapatma işlemi yalnızca aktif yöneticiler tarafından yapılabilir.';
    END IF;

    IF p_counted_cash_kurus IS NULL OR p_counted_cash_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Sayılan nakit tutarı negatif olamaz.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Kasa günü bulunamadı.';
    END IF;

    IF v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Bu kasa günü zaten kapatılmış.';
    END IF;

    -- TARİH SIRASI ZORUNLULUĞU KONTROLÜ: Hedef tarihten daha eski herhangi bir açık kasa günü varsa kapatma engellenir
    IF EXISTS (
        SELECT 1
        FROM public.kasa_days
        WHERE status = 'open'
          AND date_val < v_day.date_val
          AND id <> p_kasa_day_id
    ) THEN
        RAISE EXCEPTION 'OLDER_OPEN_DAY_EXISTS: Daha eski açık kasa günü kapatılmadan bu gün kapatılamaz.';
    END IF;

    v_expected_cash := public.fn_kasa_get_physical_cash(p_kasa_day_id);
    v_cash_diff := p_counted_cash_kurus - v_expected_cash;

    IF p_counted_usd_cents IS NOT NULL THEN
        v_usd_diff := p_counted_usd_cents - v_day.usd_balance_cents;
    END IF;

    IF p_counted_eur_cents IS NOT NULL THEN
        v_eur_diff := p_counted_eur_cents - v_day.eur_balance_cents;
    END IF;

    UPDATE public.kasa_days SET
        status = 'closed',
        closed_at = now(),
        closed_by_user_id = p_actor_user_id,
        expected_cash_kurus = v_expected_cash,
        counted_cash_kurus = p_counted_cash_kurus,
        cash_difference_kurus = v_cash_diff,
        closing_note = trim(p_closing_note),
        counted_usd_cents = COALESCE(p_counted_usd_cents, v_day.usd_balance_cents),
        usd_difference_cents = v_usd_diff,
        counted_eur_cents = COALESCE(p_counted_eur_cents, v_day.eur_balance_cents),
        eur_difference_cents = v_eur_diff
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    BEGIN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'gun_sonu_kapanis', p_counted_cash_kurus, 0, 0,
            'Gün Sonu Kapanış Sayımı (Sayılan: ' || (p_counted_cash_kurus / 100.0) || ' TL, Beklenen: ' || (v_expected_cash / 100.0) || ' TL, Fark: ' || (v_cash_diff / 100.0) || ' TL)',
            p_actor_user_id
        );
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'gun_kapatildi', 'kasa_days', p_kasa_day_id,
        jsonb_build_object(
            'expected_cash_kurus', v_expected_cash,
            'counted_cash_kurus', p_counted_cash_kurus,
            'cash_difference_kurus', v_cash_diff,
            'closing_note', p_closing_note
        )
    );

    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT) TO service_role;


-- 4. GÜN AÇILIŞI VE CONCURRENCY KORUMASI RPC'Sİ (fn_kasa_get_or_create_open_day)
CREATE OR REPLACE FUNCTION public.fn_kasa_get_or_create_open_day(
    p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today DATE;
    v_day public.kasa_days%ROWTYPE;
    v_unclosed_day public.kasa_days%ROWTYPE;
    v_prev_closed_day public.kasa_days%ROWTYPE;
    v_actor public.kasa_users%ROWTYPE;
    v_opening_balance BIGINT := 0;
    v_usd_balance BIGINT := 0;
    v_usd_cost_pool BIGINT := 0;
    v_eur_balance BIGINT := 0;
    v_eur_cost_pool BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    v_today := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;

    PERFORM pg_advisory_xact_lock(hashtext('kasa_day_open_' || v_today::text));

    SELECT * INTO v_day FROM public.kasa_days WHERE date_val = v_today;
    IF v_day.id IS NOT NULL THEN
        RETURN to_jsonb(v_day);
    END IF;

    SELECT * INTO v_unclosed_day
    FROM public.kasa_days
    WHERE status = 'open' AND date_val < v_today
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_unclosed_day.id IS NOT NULL THEN
        RAISE EXCEPTION 'PREVIOUS_DAY_UNCLOSED: % tarihli kasa günü henüz kapatılmamış. Lütfen öncelikle gün sonu sayımını yaparak önceki günü kapatın.', to_char(v_unclosed_day.date_val, 'YYYY-MM-DD');
    END IF;

    SELECT * INTO v_prev_closed_day
    FROM public.kasa_days
    WHERE status = 'closed' AND date_val < v_today
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_prev_closed_day.id IS NOT NULL THEN
        IF v_prev_closed_day.counted_cash_kurus IS NULL THEN
            RAISE EXCEPTION 'KAYNAK_BAKİYE_EKSİK: Önceki kapatılan günün (%) sayılan nakit tutarı bulunamadı.', v_prev_closed_day.date_val;
        END IF;
        v_opening_balance := v_prev_closed_day.counted_cash_kurus;
        v_usd_balance := COALESCE(v_prev_closed_day.counted_usd_cents, v_prev_closed_day.usd_balance_cents, 0);
        v_usd_cost_pool := COALESCE(v_prev_closed_day.usd_cost_pool_kurus, 0);
        v_eur_balance := COALESCE(v_prev_closed_day.counted_eur_cents, v_prev_closed_day.eur_balance_cents, 0);
        v_eur_cost_pool := COALESCE(v_prev_closed_day.eur_cost_pool_kurus, 0);
    END IF;

    BEGIN
        INSERT INTO public.kasa_days (
            date_val, status, opening_balance_kurus, usd_balance_cents, usd_cost_pool_kurus, eur_balance_cents, eur_cost_pool_kurus, opened_by_user_id
        ) VALUES (
            v_today, 'open', v_opening_balance, v_usd_balance, v_usd_cost_pool, v_eur_balance, v_eur_cost_pool, p_actor_user_id
        ) RETURNING * INTO v_day;
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_day FROM public.kasa_days WHERE date_val = v_today;
        RETURN to_jsonb(v_day);
    END;

    BEGIN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            v_day.id, 'acilis_bakiyesi', v_opening_balance, 0, 0,
            'Kasa Açılışı / Önceki Gün Devri' || CASE WHEN v_prev_closed_day.id IS NOT NULL THEN ' (Kaynak: ' || v_prev_closed_day.date_val || ')' ELSE '' END,
            p_actor_user_id
        );
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'gun_acildi', 'kasa_days', v_day.id,
        jsonb_build_object('opening_balance_kurus', v_opening_balance, 'source_day_id', v_prev_closed_day.id, 'source_date', v_prev_closed_day.date_val)
    );

    RETURN to_jsonb(v_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) TO service_role;


-- 5. GÜVENLİ DEVİR ONARIM RPC'Sİ (fn_kasa_repair_day_carryover)
DROP FUNCTION IF EXISTS public.fn_kasa_repair_day_carryover(UUID, UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.fn_kasa_repair_day_carryover(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fn_kasa_repair_day_carryover(
    p_actor_user_id UUID,
    p_target_day_id UUID,
    p_source_day_id UUID,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_target_day public.kasa_days%ROWTYPE;
    v_source_day public.kasa_days%ROWTYPE;
    v_immediate_previous_day_id UUID;
    v_old_opening BIGINT;
    v_calculated_opening BIGINT;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.role <> 'yonetici' OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Devir onarımı yalnızca aktif yöneticiler tarafından yapılabilir.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Devir onarımı için gerekçe belirtilmesi zorunludur.';
    END IF;

    SELECT * INTO v_target_day FROM public.kasa_days WHERE id = p_target_day_id FOR UPDATE;
    IF v_target_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Hedef kasa günü bulunamadı.';
    END IF;

    IF v_target_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kapanmış güne ait devir bakiyesi değiştirilemez. Hedef gün açık olmalıdır.';
    END IF;

    -- DİĞER AÇIK GÜN KONTROLÜ: Hedef gün dışındaki diğer açık kasa günleri kapatılmadan onarım yapılamaz
    IF EXISTS (
        SELECT 1
        FROM public.kasa_days
        WHERE status = 'open'
          AND id <> p_target_day_id
    ) THEN
        RAISE EXCEPTION 'OTHER_OPEN_DAYS_EXIST: Diğer açık kasa günleri kapatılmadan devir onarımı yapılamaz.';
    END IF;

    SELECT * INTO v_source_day FROM public.kasa_days WHERE id = p_source_day_id FOR UPDATE;
    IF v_source_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Seçilen kaynak kasa günü bulunamadı.';
    END IF;

    IF v_source_day.date_val >= v_target_day.date_val THEN
        RAISE EXCEPTION 'GEÇERSİZ_KAYNAK: Kaynak kasa günü hedef kasa gününden önce bir tarih olmalıdır.';
    END IF;

    -- EN YAKIN KAYNAK KONTROLÜ: Kaynak günün gerçekten hedef günden önceki en yakın kasa günü olduğu doğrulanır
    SELECT id INTO v_immediate_previous_day_id
    FROM public.kasa_days
    WHERE date_val < v_target_day.date_val
    ORDER BY date_val DESC
    LIMIT 1;

    IF v_immediate_previous_day_id IS DISTINCT FROM p_source_day_id THEN
        RAISE EXCEPTION 'SOURCE_NOT_IMMEDIATE_PREVIOUS_DAY: Devir yalnızca en yakın önceki kasa gününden alınabilir.';
    END IF;

    IF v_source_day.status <> 'closed' THEN
        RAISE EXCEPTION 'KAPATILMAMIŞ_GÜN: Kaynak kasa günü (%) henüz kapatılmamış. Devir onarımından önce kaynak günün gün sonu kapatılması zorunludur.', v_source_day.date_val;
    END IF;

    IF v_source_day.counted_cash_kurus IS NULL THEN
        RAISE EXCEPTION 'KAYNAK_BAKİYE_DOĞRULANAMADI: Kaynak günün sayılan nakit bakiyesi bulunamadı.';
    END IF;

    v_calculated_opening := v_source_day.counted_cash_kurus;
    v_old_opening := v_target_day.opening_balance_kurus;

    IF v_target_day.is_opening_repaired AND v_old_opening = v_calculated_opening THEN
        RETURN to_jsonb(v_target_day);
    END IF;

    UPDATE public.kasa_days SET
        opening_balance_kurus = v_calculated_opening,
        is_opening_repaired = true,
        repair_note = trim(p_justification)
    WHERE id = p_target_day_id
    RETURNING * INTO v_target_day;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'devir_onarildi', 'kasa_days', p_target_day_id,
        jsonb_build_object(
            'old_opening_balance_kurus', v_old_opening,
            'new_calculated_opening_balance_kurus', v_calculated_opening,
            'source_day_id', p_source_day_id,
            'source_date', v_source_day.date_val,
            'justification', trim(p_justification)
        )
    );

    BEGIN
        INSERT INTO public.kasa_movements (
            kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
        ) VALUES (
            p_target_day_id, 'carryover_repair', v_calculated_opening, 0, 0,
            'Devir Onarımı (Kaynak Gün: ' || v_source_day.date_val || '): ' || trim(p_justification),
            p_actor_user_id
        );
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    RETURN to_jsonb(v_target_day);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_repair_day_carryover(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_repair_day_carryover(UUID, UUID, UUID, TEXT) TO service_role;

COMMIT;
