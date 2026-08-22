-- Migration: 20260823010000_kasa_rpcs_and_integrity.sql
-- Description: Kasa sistemi güvenli RPC fonksiyonları, FX Maliyet Havuzu (Cost Pool), Ağırlıklı Ortalama Kur ve Döviz Devir Mantığı

BEGIN;

-- 1. PRECONDITION CHECKS
DO $$
BEGIN
  IF to_regclass('public.kasa_sales') IS NULL THEN
    RAISE EXCEPTION 'public.kasa_sales table does not exist; foundation migration must run first';
  END IF;
  IF to_regclass('public.kasa_fx_transactions') IS NULL THEN
    RAISE EXCEPTION 'public.kasa_fx_transactions table does not exist; foundation migration must run first';
  END IF;
END $$;

-- 2. SECURE SECURITY DEFINER RPC FUNCTIONS

-- A. Login Rate-Limit RPC
CREATE OR REPLACE FUNCTION public.fn_kasa_check_and_record_login_attempt(
    p_ip_hash TEXT,
    p_username TEXT,
    p_is_success BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fail_count INT := 0;
    v_lockout_minutes INT := 15;
    v_max_attempts INT := 5;
BEGIN
    SELECT COUNT(*) INTO v_fail_count
    FROM public.kasa_login_attempts
    WHERE (ip_hash = p_ip_hash OR username = p_username)
      AND is_success = false
      AND attempted_at >= (now() - (v_lockout_minutes || ' minutes')::INTERVAL);

    IF v_fail_count >= v_max_attempts THEN
        RAISE EXCEPTION 'ÇOK_FAZLA_DENEME: Bu kullanıcı/IP adresi için 5 kez hatalı giriş yapıldı. Güvenlik nedeniyle hesabınız % dakika kilitlenmiştir.', v_lockout_minutes;
    END IF;

    INSERT INTO public.kasa_login_attempts (ip_hash, username, is_success)
    VALUES (p_ip_hash, p_username, p_is_success);

    IF p_is_success THEN
        DELETE FROM public.kasa_login_attempts
        WHERE (ip_hash = p_ip_hash OR username = p_username) AND is_success = false;
    END IF;

    RETURN jsonb_build_object('success', true, 'fail_count', v_fail_count);
END;
$$;

-- B. Aktif Günü Getir veya Devir Bakiyesi İle Oluştur (Döviz Miktarı VE Döviz Maliyet Havuzu Birlikte Devreder!)
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
    v_prev_day public.kasa_days%ROWTYPE;
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

    SELECT * INTO v_day FROM public.kasa_days WHERE date_val = v_today;

    IF v_day.id IS NULL THEN
        SELECT * INTO v_prev_day
        FROM public.kasa_days
        WHERE status = 'closed' AND date_val < v_today
        ORDER BY date_val DESC
        LIMIT 1;

        IF v_prev_day.id IS NOT NULL THEN
            v_opening_balance := COALESCE(v_prev_day.counted_cash_kurus, v_prev_day.expected_cash_kurus, 0);
            v_usd_balance := COALESCE(v_prev_day.counted_usd_cents, v_prev_day.usd_balance_cents, 0);
            v_usd_cost_pool := COALESCE(v_prev_day.usd_cost_pool_kurus, 0);
            v_eur_balance := COALESCE(v_prev_day.counted_eur_cents, v_prev_day.eur_balance_cents, 0);
            v_eur_cost_pool := COALESCE(v_prev_day.eur_cost_pool_kurus, 0);
        END IF;

        INSERT INTO public.kasa_days (
            date_val, status, opening_balance_kurus, usd_balance_cents, usd_cost_pool_kurus, eur_balance_cents, eur_cost_pool_kurus, opened_by_user_id
        ) VALUES (
            v_today, 'open', v_opening_balance, v_usd_balance, v_usd_cost_pool, v_eur_balance, v_eur_cost_pool, p_actor_user_id
        ) RETURNING * INTO v_day;

        INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (
            p_actor_user_id, 'gun_acildi', 'kasa_days', v_day.id,
            jsonb_build_object(
                'date_val', v_today,
                'opening_balance_kurus', v_opening_balance,
                'usd_balance_cents', v_usd_balance,
                'usd_cost_pool_kurus', v_usd_cost_pool,
                'eur_balance_cents', v_eur_balance,
                'eur_cost_pool_kurus', v_eur_cost_pool
            )
        );
    END IF;

    RETURN to_jsonb(v_day);
END;
$$;

-- C. Döviz Sermayesi Ekleme RPC (Yönetici)
CREATE OR REPLACE FUNCTION public.fn_kasa_inject_fx_capital(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_currency_code TEXT,
    p_foreign_amount_cents BIGINT,
    p_exchange_rate NUMERIC(12, 4),
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_tl_equivalent BIGINT;
    v_fx_trans public.kasa_fx_transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Döviz sermayesi girişi yalnızca yöneticilere aittir.';
    END IF;
    IF p_currency_code NOT IN ('USD', 'EUR') THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Yalnızca USD veya EUR sermayesi eklenebilir.';
    END IF;
    IF p_foreign_amount_cents <= 0 OR p_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Döviz miktarı ve kur pozitif olmalıdır.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    v_tl_equivalent := ROUND((p_foreign_amount_cents / 100.0) * p_exchange_rate * 100);

    -- Döviz Kasasına ve Maliyet Havuzuna Ekle
    IF p_currency_code = 'USD' THEN
        UPDATE public.kasa_days SET
            usd_balance_cents = usd_balance_cents + p_foreign_amount_cents,
            usd_cost_pool_kurus = usd_cost_pool_kurus + v_tl_equivalent
        WHERE id = p_kasa_day_id;
    ELSE
        UPDATE public.kasa_days SET
            eur_balance_cents = eur_balance_cents + p_foreign_amount_cents,
            eur_cost_pool_kurus = eur_cost_pool_kurus + v_tl_equivalent
        WHERE id = p_kasa_day_id;
    END IF;

    INSERT INTO public.kasa_fx_transactions (
        kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'fx_capital_injection', p_currency_code, p_foreign_amount_cents, p_exchange_rate, v_tl_equivalent,
        COALESCE(p_description, p_currency_code || ' Sermaye Girişi'), p_actor_user_id
    ) RETURNING * INTO v_fx_trans;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'fx_capital_injection', v_tl_equivalent, 0, 0,
        (p_foreign_amount_cents / 100.0) || ' ' || p_currency_code || ' Sermaye Girişi', p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'doviz_sermayesi_eklendi', 'kasa_fx_transactions', v_fx_trans.id, jsonb_build_object('currency', p_currency_code, 'amount_cents', p_foreign_amount_cents));

    RETURN to_jsonb(v_fx_trans);
END;
$$;

-- D. Döviz Bozdurma RPC (Maliyet Havuzlu Ağırlıklı Ortalama Hesabı)
CREATE OR REPLACE FUNCTION public.fn_kasa_convert_fx_to_try(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_currency_code TEXT,
    p_foreign_amount_cents BIGINT,
    p_actual_rate_numeric NUMERIC(12, 4),
    p_description TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_current_cents BIGINT;
    v_current_cost_pool BIGINT;
    v_avg_cost_rate NUMERIC(12, 4);
    v_try_received_kurus BIGINT;
    v_cost_kurus BIGINT;
    v_realized_diff_kurus BIGINT;
    v_new_cents BIGINT;
    v_new_cost_pool BIGINT;
    v_fx_trans public.kasa_fx_transactions%ROWTYPE;
    v_existing public.kasa_fx_transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;
    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Döviz bozdurma işlemi yalnızca yetkili yöneticilere aittir.';
    END IF;
    IF p_currency_code NOT IN ('USD', 'EUR') THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Yalnızca USD veya EUR bozdurulabilir.';
    END IF;
    IF p_foreign_amount_cents <= 0 OR p_actual_rate_numeric <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Miktar ve kur 0 veya negatif olamaz.';
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_fx_transactions WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    IF p_currency_code = 'USD' THEN
        v_current_cents := v_day.usd_balance_cents;
        v_current_cost_pool := v_day.usd_cost_pool_kurus;
    ELSE
        v_current_cents := v_day.eur_balance_cents;
        v_current_cost_pool := v_day.eur_cost_pool_kurus;
    END IF;

    IF v_current_cents < p_foreign_amount_cents THEN
        RAISE EXCEPTION 'YETERSİZ_DÖVİZ: Kasada bozdurulacak yeterli % bulunmamaktadır (Mevcut: % FX).', p_currency_code, (v_current_cents / 100.0);
    END IF;

    -- Ağırlıklı Ortalama Maliyet Kuru
    IF v_current_cents > 0 AND v_current_cost_pool > 0 THEN
        v_avg_cost_rate := (v_current_cost_pool::NUMERIC / v_current_cents::NUMERIC);
    ELSE
        v_avg_cost_rate := p_actual_rate_numeric;
    END IF;

    -- Elde Edilen TL Nakit ve Düşülecek Maliyet
    v_try_received_kurus := ROUND((p_foreign_amount_cents / 100.0) * p_actual_rate_numeric * 100);

    IF v_current_cents = p_foreign_amount_cents THEN
        -- TAMAMEN BOZDURULUYORSA: Maliyet havuzu 0 yapılır!
        v_cost_kurus := v_current_cost_pool;
        v_new_cents := 0;
        v_new_cost_pool := 0;
    ELSE
        -- KISMİ BOZDURMA: Orantılı maliyet düşülür
        v_cost_kurus := ROUND((p_foreign_amount_cents / 100.0) * v_avg_cost_rate * 100);
        v_new_cents := v_current_cents - p_foreign_amount_cents;
        v_new_cost_pool := GREATEST(v_current_cost_pool - v_cost_kurus, 0);
    END IF;

    v_realized_diff_kurus := v_try_received_kurus - v_cost_kurus;

    IF p_currency_code = 'USD' THEN
        UPDATE public.kasa_days SET usd_balance_cents = v_new_cents, usd_cost_pool_kurus = v_new_cost_pool WHERE id = p_kasa_day_id;
    ELSE
        UPDATE public.kasa_days SET eur_balance_cents = v_new_cents, eur_cost_pool_kurus = v_new_cost_pool WHERE id = p_kasa_day_id;
    END IF;

    INSERT INTO public.kasa_fx_transactions (
        kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, realized_fx_diff_kurus, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, 'fx_conversion_to_try', p_currency_code, p_foreign_amount_cents, p_actual_rate_numeric, v_try_received_kurus, v_realized_diff_kurus,
        COALESCE(p_description, p_currency_code || ' Bozduruldu'), p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_fx_trans;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'fx_conversion_to_try', v_try_received_kurus, v_try_received_kurus, 0,
        (p_foreign_amount_cents / 100.0) || ' ' || p_currency_code || ' Bozduruldu (' || p_actual_rate_numeric || ' TL)', p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'doviz_bozduruldu', 'kasa_fx_transactions', v_fx_trans.id, jsonb_build_object('currency', p_currency_code, 'amount_cents', p_foreign_amount_cents, 'actual_rate', p_actual_rate_numeric, 'avg_cost_rate', v_avg_cost_rate, 'cost_kurus', v_cost_kurus, 'realized_diff_kurus', v_realized_diff_kurus));

    RETURN to_jsonb(v_fx_trans);
END;
$$;

-- E. Satış İptal RPC
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
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_sale public.kasa_sales%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active OR v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Satış iptali işlemi yalnızca yöneticilere aittir.';
    END IF;
    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Satış iptali için gerekçe zorunludur.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Satış bulunamadı veya zaten iptal edilmiş.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_sale.kasa_day_id FOR UPDATE;

    UPDATE public.kasa_sales SET status = 'cancelled' WHERE id = p_sale_id RETURNING * INTO v_sale;

    IF v_sale.usd_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            usd_balance_cents = GREATEST(usd_balance_cents - v_sale.usd_paid_cents, 0),
            usd_cost_pool_kurus = GREATEST(usd_cost_pool_kurus - v_sale.usd_tl_equivalent_kurus, 0)
        WHERE id = v_sale.kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, sale_id, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'fx_cancellation', 'USD', -v_sale.usd_paid_cents, v_sale.usd_rate, -v_sale.usd_tl_equivalent_kurus, v_sale.id, p_actor_user_id
        );
    END IF;

    IF v_sale.eur_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            eur_balance_cents = GREATEST(eur_balance_cents - v_sale.eur_paid_cents, 0),
            eur_cost_pool_kurus = GREATEST(eur_cost_pool_kurus - v_sale.eur_tl_equivalent_kurus, 0)
        WHERE id = v_sale.kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, sale_id, created_by_user_id
        ) VALUES (
            v_sale.kasa_day_id, 'fx_cancellation', 'EUR', -v_sale.eur_paid_cents, v_sale.eur_rate, -v_sale.eur_tl_equivalent_kurus, v_sale.id, p_actor_user_id
        );
    END IF;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, justification, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'iptal', v_sale.id, -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus,
        'Satış İptali: ' || v_sale.product_name || ' (' || v_sale.receipt_no || ')', p_justification, p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, justification, details)
    VALUES (p_actor_user_id, 'satis_iptal_edildi', 'kasa_sales', p_sale_id, p_justification, jsonb_build_object('receipt_no', v_sale.receipt_no, 'total_price_kurus', v_sale.total_price_kurus));

    RETURN to_jsonb(v_sale);
END;
$$;

-- F. Bankaya Nakit Çıkışı RPC
CREATE OR REPLACE FUNCTION public.fn_kasa_deposit_to_bank(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_amount_kurus BIGINT,
    p_bank_name TEXT DEFAULT NULL,
    p_reference_no TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_total_cash_sales BIGINT := 0;
    v_total_cash_expenses BIGINT := 0;
    v_total_bank_deposits BIGINT := 0;
    v_total_fx_conversions BIGINT := 0;
    v_current_cash BIGINT := 0;
    v_deposit public.kasa_bank_deposits%ROWTYPE;
    v_existing public.kasa_bank_deposits%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;
    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Bankaya nakit yatırma işlemi yalnızca yöneticilere aittir.';
    END IF;
    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Yatırılacak tutar 0 veya negatif olamaz.';
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_bank_deposits WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_sales
    FROM public.kasa_sales WHERE kasa_day_id = p_kasa_day_id AND status = 'completed';

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_cash_expenses
    FROM public.kasa_expenses WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_bank_deposits
    FROM public.kasa_bank_deposits WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_total_fx_conversions
    FROM public.kasa_fx_transactions WHERE kasa_day_id = p_kasa_day_id AND transaction_type = 'fx_conversion_to_try';

    v_current_cash := v_day.opening_balance_kurus + v_day.capital_injected_kurus - v_day.owner_withdrawn_kurus + v_total_cash_sales + v_total_fx_conversions - v_total_cash_expenses - v_total_bank_deposits;

    IF v_current_cash < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasada bankaya çıkılacak yeterli fiziki TL nakit yok (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    INSERT INTO public.kasa_bank_deposits (
        kasa_day_id, amount_kurus, bank_name, reference_no, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, p_amount_kurus, p_bank_name, p_reference_no, COALESCE(p_description, 'Bankaya Yatırılan Nakit'), p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_deposit;

    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'bank_deposit', -p_amount_kurus, -p_amount_kurus, 0,
        'Bankaya Yatırılan Nakit (' || COALESCE(p_bank_name, 'Banka') || ')', p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'bankaya_yatirildi', 'kasa_bank_deposits', v_deposit.id, jsonb_build_object('amount_kurus', p_amount_kurus, 'bank_name', p_bank_name));

    RETURN to_jsonb(v_deposit);
END;
$$;

-- G. Gün Sonu Kapanış RPC
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
    v_total_cash_sales BIGINT := 0;
    v_total_cash_expenses BIGINT := 0;
    v_total_bank_deposits BIGINT := 0;
    v_total_fx_conversions BIGINT := 0;
    v_expected_cash BIGINT := 0;
    v_cash_diff BIGINT := 0;
    v_usd_diff BIGINT := 0;
    v_eur_diff BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı oturumu geçersiz.';
    END IF;
    IF v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Gün sonu kapatma yetkisi yalnızca yöneticilere aittir.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Kasa günü bulunamadı.';
    END IF;

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_sales
    FROM public.kasa_sales WHERE kasa_day_id = p_kasa_day_id AND status = 'completed';

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_cash_expenses
    FROM public.kasa_expenses WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_bank_deposits
    FROM public.kasa_bank_deposits WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_total_fx_conversions
    FROM public.kasa_fx_transactions WHERE kasa_day_id = p_kasa_day_id AND transaction_type = 'fx_conversion_to_try';

    v_expected_cash := v_day.opening_balance_kurus + v_day.capital_injected_kurus - v_day.owner_withdrawn_kurus + v_total_cash_sales + v_total_fx_conversions - v_total_cash_expenses - v_total_bank_deposits;
    v_cash_diff := p_counted_cash_kurus - v_expected_cash;

    IF p_counted_usd_cents IS NOT NULL THEN
        v_usd_diff := p_counted_usd_cents - v_day.usd_balance_cents;
    END IF;

    IF p_counted_eur_cents IS NOT NULL THEN
        v_eur_diff := p_counted_eur_cents - v_day.eur_balance_cents;
    END IF;

    UPDATE public.kasa_days SET
        status = 'closed',
        expected_cash_kurus = v_expected_cash,
        counted_cash_kurus = p_counted_cash_kurus,
        cash_difference_kurus = v_cash_diff,
        counted_usd_cents = p_counted_usd_cents,
        counted_eur_cents = p_counted_eur_cents,
        usd_difference_cents = v_usd_diff,
        eur_difference_cents = v_eur_diff,
        closed_at = now(),
        closed_by_user_id = p_actor_user_id,
        closing_note = p_closing_note
    WHERE id = p_kasa_day_id
    RETURNING * INTO v_day;

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_user_id, 'gun_kapatildi', 'kasa_days', p_kasa_day_id,
        jsonb_build_object(
            'expected_cash_kurus', v_expected_cash,
            'counted_cash_kurus', p_counted_cash_kurus,
            'cash_difference_kurus', v_cash_diff,
            'counted_usd_cents', p_counted_usd_cents,
            'usd_difference_cents', v_usd_diff,
            'counted_eur_cents', p_counted_eur_cents,
            'eur_difference_cents', v_eur_diff
        )
    );

    RETURN to_jsonb(v_day);
END;
$$;

-- REVOKE ALL FROM PUBLIC
REVOKE ALL ON FUNCTION public.fn_kasa_check_and_record_login_attempt(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_get_or_create_open_day(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_inject_fx_capital(UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_convert_fx_to_try(UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_cancel_sale(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_deposit_to_bank(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kasa_close_day(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;

COMMIT;
