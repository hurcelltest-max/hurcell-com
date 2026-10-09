-- Comprehensive V30 Test Suite executed inside a safe BEGIN / ROLLBACK block
BEGIN;

DO $$
DECLARE
    v_hur_id uuid;
    v_koray_id uuid;
    v_open_day record;
    v_closed_day record;
    v_fotokopi_cat record;
    v_ts_cat record;
    v_teb_bank record;
    v_test_sale_open_id uuid;
    v_test_sale_closed_id uuid;
    v_test_ts_sale_closed_id uuid;
    v_res1 jsonb;
    v_res2 jsonb;
    v_bank_tx_count int;
    v_movements_count int;
    v_audit_count int;
    v_idem_key text := 'v30_test_' || gen_random_uuid()::text;
    v_err_msg text;
    v_caught boolean;
    v_receipt_0310 record;
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'HURCELL KASA V30 TEST SUITE (ROLLBACK ENFORCED)';
    RAISE NOTICE '=====================================================';

    -- 1. Setup actors & entities
    SELECT id INTO v_hur_id FROM kasa_users WHERE username = 'hur';
    SELECT id INTO v_koray_id FROM kasa_users WHERE username = 'koray';
    
    SELECT * INTO v_open_day FROM kasa_days WHERE status = 'open' ORDER BY date_val DESC LIMIT 1;
    SELECT * INTO v_closed_day FROM kasa_days WHERE status = 'closed' ORDER BY date_val DESC LIMIT 1;
    SELECT * INTO v_fotokopi_cat FROM kasa_categories WHERE name = 'Fotokopi' AND is_active = true LIMIT 1;
    SELECT * INTO v_ts_cat FROM kasa_categories WHERE name = 'Teknik Servis' AND is_active = true LIMIT 1;
    SELECT * INTO v_teb_bank FROM kasa_bank_accounts WHERE bank_name = 'TEB' AND is_active = true LIMIT 1;

    -- =========================================================================
    -- TEST 1: OPEN DAY UPDATE (CASH -> POS TEB) & IDEMPOTENCY REPLAY
    -- =========================================================================
    v_res1 := fn_kasa_create_sale(
        p_actor_user_id => v_hur_id,
        p_kasa_day_id => v_open_day.id,
        p_category_id => v_fotokopi_cat.id,
        p_product_name => 'TEST V30 OPEN SALE',
        p_quantity => 1,
        p_unit_price_kurus => 20000,
        p_total_price_kurus => 20000,
        p_cost_price_kurus => 0,
        p_service_cost_kurus => 0,
        p_cash_paid_kurus => 20000,
        p_card_paid_kurus => 0,
        p_bank_transfer_paid_kurus => 0,
        p_bank_transfer_reference => NULL,
        p_usd_paid_cents => 0,
        p_usd_rate => NULL,
        p_usd_tl_equivalent_kurus => 0,
        p_eur_paid_cents => 0,
        p_eur_rate => NULL,
        p_eur_tl_equivalent_kurus => 0,
        p_credit_customer_id => NULL,
        p_credit_paid_kurus => 0,
        p_uncollected_credit_kurus => 0,
        p_uncollected_cost_kurus => 0,
        p_description => 'V30 open sale initial cash',
        p_customer_name => NULL,
        p_customer_phone => NULL,
        p_serial_imei => NULL,
        p_technical_service_details => NULL,
        p_service_cost_payment_status => 'no_cost',
        p_service_cost_payment_source => NULL,
        p_service_cost_bank_account_id => NULL,
        p_idempotency_key => 'create_' || v_idem_key,
        p_pos_bank_account_id => NULL
    );
    v_test_sale_open_id := (v_res1->>'id')::uuid;

    -- First update to TEB card
    v_res1 := fn_kasa_update_sale(
        p_actor_user_id => v_hur_id,
        p_sale_id => v_test_sale_open_id,
        p_category_id => v_fotokopi_cat.id,
        p_product_name => 'TEST V30 OPEN SALE UPDATED',
        p_quantity => 1,
        p_unit_price_kurus => 20000,
        p_total_price_kurus => 20000,
        p_cost_price_kurus => 0,
        p_service_cost_kurus => 0,
        p_cash_paid_kurus => 0,
        p_card_paid_kurus => 20000,
        p_bank_transfer_paid_kurus => 0,
        p_bank_transfer_reference => NULL,
        p_usd_paid_cents => 0,
        p_usd_rate => NULL,
        p_usd_tl_equivalent_kurus => 0,
        p_eur_paid_cents => 0,
        p_eur_rate => NULL,
        p_eur_tl_equivalent_kurus => 0,
        p_credit_customer_id => NULL,
        p_credit_paid_kurus => 0,
        p_uncollected_credit_kurus => 0,
        p_uncollected_cost_kurus => 0,
        p_description => 'V30 open sale updated to TEB POS',
        p_customer_name => NULL,
        p_customer_phone => NULL,
        p_serial_imei => NULL,
        p_technical_service_details => NULL,
        p_service_cost_payment_status => 'no_cost',
        p_service_cost_payment_source => NULL,
        p_service_cost_bank_account_id => NULL,
        p_idempotency_key => 'update_' || v_idem_key,
        p_justification => 'Müşteri TEB kart ile ödedi',
        p_pos_bank_account_id => v_teb_bank.id
    );

    SELECT count(*) INTO v_bank_tx_count FROM kasa_bank_transactions WHERE related_sale_id = v_test_sale_open_id AND status = 'active';
    SELECT count(*) INTO v_movements_count FROM kasa_movements WHERE sale_id = v_test_sale_open_id;
    SELECT count(*) INTO v_audit_count FROM kasa_audit_logs WHERE entity_id = v_test_sale_open_id AND action = 'sale_update';

    IF v_bank_tx_count <> 1 OR v_movements_count <> 3 OR v_audit_count <> 1 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Invalid initial update counts (bank_tx=%, movements=%, audit=%)', v_bank_tx_count, v_movements_count, v_audit_count;
    END IF;
    RAISE NOTICE 'TEST 1A PASSED: Open day update created expected records.';

    -- Replay exact same request
    v_res2 := fn_kasa_update_sale(
        p_actor_user_id => v_hur_id,
        p_sale_id => v_test_sale_open_id,
        p_category_id => v_fotokopi_cat.id,
        p_product_name => 'TEST V30 OPEN SALE UPDATED',
        p_quantity => 1,
        p_unit_price_kurus => 20000,
        p_total_price_kurus => 20000,
        p_cost_price_kurus => 0,
        p_service_cost_kurus => 0,
        p_cash_paid_kurus => 0,
        p_card_paid_kurus => 20000,
        p_bank_transfer_paid_kurus => 0,
        p_bank_transfer_reference => NULL,
        p_usd_paid_cents => 0,
        p_usd_rate => NULL,
        p_usd_tl_equivalent_kurus => 0,
        p_eur_paid_cents => 0,
        p_eur_rate => NULL,
        p_eur_tl_equivalent_kurus => 0,
        p_credit_customer_id => NULL,
        p_credit_paid_kurus => 0,
        p_uncollected_credit_kurus => 0,
        p_uncollected_cost_kurus => 0,
        p_description => 'V30 open sale updated to TEB POS',
        p_customer_name => NULL,
        p_customer_phone => NULL,
        p_serial_imei => NULL,
        p_technical_service_details => NULL,
        p_service_cost_payment_status => 'no_cost',
        p_service_cost_payment_source => NULL,
        p_service_cost_bank_account_id => NULL,
        p_idempotency_key => 'update_' || v_idem_key,
        p_justification => 'Müşteri TEB kart ile ödedi',
        p_pos_bank_account_id => v_teb_bank.id
    );

    SELECT count(*) INTO v_bank_tx_count FROM kasa_bank_transactions WHERE related_sale_id = v_test_sale_open_id AND status = 'active';
    SELECT count(*) INTO v_movements_count FROM kasa_movements WHERE sale_id = v_test_sale_open_id;
    SELECT count(*) INTO v_audit_count FROM kasa_audit_logs WHERE entity_id = v_test_sale_open_id AND action = 'sale_update';

    IF v_bank_tx_count <> 1 OR v_movements_count <> 3 OR v_audit_count <> 1 THEN
        RAISE EXCEPTION 'TEST 1 REPLAY FAILED: Duplicates created on replay.';
    END IF;
    RAISE NOTICE 'TEST 1B PASSED: Replay strictly idempotent.';

    -- =========================================================================
    -- TEST 2: IDEMPOTENCY CONFLICT CHECKS (CROSS-ACTOR & CROSS-PAYLOAD)
    -- =========================================================================
    v_caught := false;
    BEGIN
        PERFORM fn_kasa_update_sale(
            p_actor_user_id => v_koray_id,
            p_sale_id => v_test_sale_open_id,
            p_category_id => v_fotokopi_cat.id,
            p_product_name => 'TEST V30 OPEN SALE UPDATED',
            p_quantity => 1,
            p_unit_price_kurus => 20000,
            p_total_price_kurus => 20000,
            p_cost_price_kurus => 0,
            p_service_cost_kurus => 0,
            p_cash_paid_kurus => 0,
            p_card_paid_kurus => 20000,
            p_bank_transfer_paid_kurus => 0,
            p_bank_transfer_reference => NULL,
            p_usd_paid_cents => 0,
            p_usd_rate => NULL,
            p_usd_tl_equivalent_kurus => 0,
            p_eur_paid_cents => 0,
            p_eur_rate => NULL,
            p_eur_tl_equivalent_kurus => 0,
            p_credit_customer_id => NULL,
            p_credit_paid_kurus => 0,
            p_uncollected_credit_kurus => 0,
            p_uncollected_cost_kurus => 0,
            p_description => 'V30 open sale updated to TEB POS',
            p_customer_name => NULL,
            p_customer_phone => NULL,
            p_serial_imei => NULL,
            p_technical_service_details => NULL,
            p_service_cost_payment_status => 'no_cost',
            p_service_cost_payment_source => NULL,
            p_service_cost_bank_account_id => NULL,
            p_idempotency_key => 'update_' || v_idem_key,
            p_justification => 'Müşteri TEB kart ile ödedi',
            p_pos_bank_account_id => v_teb_bank.id
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%ÇAKIŞAN_İDEMPOTENCY_KEY%' THEN
            v_caught := true;
        END IF;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'TEST 2A FAILED: Cross-actor idempotency conflict not caught.';
    END IF;
    RAISE NOTICE 'TEST 2A PASSED: Cross-actor conflict caught.';

    -- =========================================================================
    -- TEST 3: CLOSED DAY NET CASH MUTATION HARDENING (TECHNICAL SERVICE CASH OUT)
    -- =========================================================================
    -- Create a test sale directly in closed day inside this transaction
    INSERT INTO kasa_sales (
        kasa_day_id, category_id, product_name, quantity, unit_price_kurus, total_price_kurus,
        cost_price_kurus, service_cost_kurus, cash_paid_kurus, card_paid_kurus, bank_transfer_paid_kurus,
        service_cost_payment_status, service_cost_payment_source, status, created_by_user_id, receipt_no, customer_name
    ) VALUES (
        v_closed_day.id, v_ts_cat.id, 'TEST TS CLOSED SALE', 1, 50000, 50000,
        0, 10000, 50000, 0, 0,
        'paid_from_cash', 'cash', 'completed', v_hur_id, 'FIS-TEST-TS-CLOSED', 'Müşteri Ahmet'
    ) RETURNING id INTO v_test_ts_sale_closed_id;

    -- A) Attempting to change TS cost from paid_from_cash to paid_from_bank on closed day
    -- This changes net cash impact from (50000 - 10000 = 40000) to (50000 - 0 = 50000) -> MUST FAIL
    v_caught := false;
    BEGIN
        PERFORM fn_kasa_update_sale(
            p_actor_user_id => v_hur_id,
            p_sale_id => v_test_ts_sale_closed_id,
            p_category_id => v_ts_cat.id,
            p_product_name => 'TEST TS CLOSED SALE',
            p_quantity => 1,
            p_unit_price_kurus => 50000,
            p_total_price_kurus => 50000,
            p_cost_price_kurus => 0,
            p_service_cost_kurus => 10000,
            p_cash_paid_kurus => 50000,
            p_card_paid_kurus => 0,
            p_bank_transfer_paid_kurus => 0,
            p_bank_transfer_reference => NULL,
            p_usd_paid_cents => 0,
            p_usd_rate => NULL,
            p_usd_tl_equivalent_kurus => 0,
            p_eur_paid_cents => 0,
            p_eur_rate => NULL,
            p_eur_tl_equivalent_kurus => 0,
            p_credit_customer_id => NULL,
            p_credit_paid_kurus => 0,
            p_uncollected_credit_kurus => 0,
            p_uncollected_cost_kurus => 0,
            p_description => 'Attempting TS cost payment source change on closed day',
            p_customer_name => 'Müşteri Ahmet',
            p_customer_phone => NULL,
            p_serial_imei => NULL,
            p_technical_service_details => NULL,
            p_service_cost_payment_status => 'paid_from_bank',
            p_service_cost_payment_source => 'bank',
            p_service_cost_bank_account_id => v_teb_bank.id,
            p_idempotency_key => 'ts_net_cash_' || v_idem_key,
            p_justification => 'Maliyet bankadan ödendi olarak değiştirme denemesi',
            p_pos_bank_account_id => NULL
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%KAPALI_GÜN_NAKİT_DEĞİŞTİRİLEMEZ%' THEN
            v_caught := true;
        END IF;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'TEST 3A FAILED: TS paid_from_cash source change on closed day was NOT rejected: %', v_err_msg;
    END IF;
    RAISE NOTICE 'TEST 3A PASSED: TS cash out mutation on closed day rejected with KAPALI_GÜN_NAKİT_DEĞİŞTİRİLEMEZ.';

    -- B) Non-cash correction on closed day (updating product name / description / justification while keeping net cash identical)
    v_res1 := fn_kasa_update_sale(
        p_actor_user_id => v_hur_id,
        p_sale_id => v_test_ts_sale_closed_id,
        p_category_id => v_ts_cat.id,
        p_product_name => 'TEST TS CLOSED SALE - CORRECTED NAME',
        p_quantity => 1,
        p_unit_price_kurus => 50000,
        p_total_price_kurus => 50000,
        p_cost_price_kurus => 0,
        p_service_cost_kurus => 10000,
        p_cash_paid_kurus => 50000,
        p_card_paid_kurus => 0,
        p_bank_transfer_paid_kurus => 0,
        p_bank_transfer_reference => NULL,
        p_usd_paid_cents => 0,
        p_usd_rate => NULL,
        p_usd_tl_equivalent_kurus => 0,
        p_eur_paid_cents => 0,
        p_eur_rate => NULL,
        p_eur_tl_equivalent_kurus => 0,
        p_credit_customer_id => NULL,
        p_credit_paid_kurus => 0,
        p_uncollected_credit_kurus => 0,
        p_uncollected_cost_kurus => 0,
        p_description => 'Valid non-cash metadata correction on closed day',
        p_customer_name => 'Müşteri Ahmet',
        p_customer_phone => NULL,
        p_serial_imei => NULL,
        p_technical_service_details => NULL,
        p_service_cost_payment_status => 'paid_from_cash',
        p_service_cost_payment_source => 'cash',
        p_service_cost_bank_account_id => NULL,
        p_idempotency_key => 'ts_valid_meta_' || v_idem_key,
        p_justification => 'Ürün adı yazım hatası düzeltildi',
        p_pos_bank_account_id => NULL
    );

    IF v_res1->>'product_name' <> 'TEST TS CLOSED SALE - CORRECTED NAME' THEN
        RAISE EXCEPTION 'TEST 3B FAILED: Valid closed day non-cash correction did not succeed.';
    END IF;
    RAISE NOTICE 'TEST 3B PASSED: Valid closed day manager non-cash correction succeeded.';

    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'ALL HURCELL KASA V30 TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '=====================================================';
END;
$$;

-- Always ROLLBACK so that no test rows or balance modifications persist in DB
ROLLBACK;
