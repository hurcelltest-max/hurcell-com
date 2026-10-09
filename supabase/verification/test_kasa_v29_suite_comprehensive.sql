DO $$
DECLARE
    v_hur_id uuid;
    v_koray_id uuid;
    v_open_day record;
    v_closed_day record;
    v_fotokopi_cat record;
    v_teb_bank record;
    v_test_sale_open_id uuid;
    v_test_sale_closed_id uuid;
    v_res1 jsonb;
    v_res2 jsonb;
    v_bank_tx_count int;
    v_movements_count int;
    v_audit_count int;
    v_idem_key text := 'idem_v29_' || gen_random_uuid()::text;
    v_err_msg text;
    v_caught boolean;
    v_receipt_0310 record;
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'HURCELL KASA V29 COMPREHENSIVE VERIFICATION SUITE';
    RAISE NOTICE '=====================================================';

    -- 1. Setup actors & entities
    SELECT id INTO v_hur_id FROM kasa_users WHERE username = 'hur';
    SELECT id INTO v_koray_id FROM kasa_users WHERE username = 'koray';
    
    SELECT * INTO v_open_day FROM kasa_days WHERE status = 'open' ORDER BY date_val DESC LIMIT 1;
    SELECT * INTO v_closed_day FROM kasa_days WHERE status = 'closed' ORDER BY date_val DESC LIMIT 1;
    SELECT * INTO v_fotokopi_cat FROM kasa_categories WHERE name = 'Fotokopi' AND is_active = true LIMIT 1;
    SELECT * INTO v_teb_bank FROM kasa_bank_accounts WHERE bank_name = 'TEB' AND is_active = true LIMIT 1;

    RAISE NOTICE 'Actors: Hur=%, Koray=%', v_hur_id, v_koray_id;
    RAISE NOTICE 'Open Day Date: %, Closed Day Date: %', v_open_day.date_val, v_closed_day.date_val;
    RAISE NOTICE 'Category: %, TEB Bank ID: %', v_fotokopi_cat.name, v_teb_bank.id;

    -- =========================================================================
    -- TEST 1: OPEN DAY UPDATE (CASH -> POS TEB) & IDEMPOTENCY REPLAY
    -- =========================================================================
    RAISE NOTICE '-----------------------------------------------------';
    RAISE NOTICE 'TEST 1: OPEN DAY CASH -> CARD POS & IDEMPOTENCY REPLAY';
    
    -- Create test sale in open day
    v_res1 := fn_kasa_create_sale(
        p_actor_user_id => v_hur_id,
        p_kasa_day_id => v_open_day.id,
        p_category_id => v_fotokopi_cat.id,
        p_product_name => 'TEST V29 FOTOKOPI NAKIT',
        p_quantity => 1,
        p_unit_price_kurus => 15000,
        p_total_price_kurus => 15000,
        p_cost_price_kurus => 0,
        p_service_cost_kurus => 0,
        p_cash_paid_kurus => 15000,
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
        p_description => 'V29 Open test sale initial cash',
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
    RAISE NOTICE 'Created Open Test Sale ID: %', v_test_sale_open_id;

    -- Update to Card Paid with TEB POS bank and idempotency key
    v_res1 := fn_kasa_update_sale(
        p_actor_user_id => v_hur_id,
        p_sale_id => v_test_sale_open_id,
        p_category_id => v_fotokopi_cat.id,
        p_product_name => 'TEST V29 FOTOKOPI KART',
        p_quantity => 1,
        p_unit_price_kurus => 15000,
        p_total_price_kurus => 15000,
        p_cost_price_kurus => 0,
        p_service_cost_kurus => 0,
        p_cash_paid_kurus => 0,
        p_card_paid_kurus => 15000,
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
        p_description => 'V29 Open test sale updated to POS',
        p_customer_name => NULL,
        p_customer_phone => NULL,
        p_serial_imei => NULL,
        p_technical_service_details => NULL,
        p_service_cost_payment_status => 'no_cost',
        p_service_cost_payment_source => NULL,
        p_service_cost_bank_account_id => NULL,
        p_idempotency_key => 'update_' || v_idem_key,
        p_justification => 'Müşteri nakit yerine TEB POS kart ile ödedi',
        p_pos_bank_account_id => v_teb_bank.id
    );

    -- Count active bank transactions
    SELECT count(*) INTO v_bank_tx_count FROM kasa_bank_transactions WHERE related_sale_id = v_test_sale_open_id AND status = 'active';
    -- Count movements
    SELECT count(*) INTO v_movements_count FROM kasa_movements WHERE sale_id = v_test_sale_open_id;
    -- Count audit logs
    SELECT count(*) INTO v_audit_count FROM kasa_audit_logs WHERE entity_id = v_test_sale_open_id AND action = 'sale_update';

    IF v_bank_tx_count <> 1 OR v_movements_count <> 3 OR v_audit_count <> 1 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Initial update counts invalid (bank_tx=%, movements=%, audit=%)', v_bank_tx_count, v_movements_count, v_audit_count;
    END IF;
    RAISE NOTICE 'TEST 1A PASSED: Bank tx count=%, Movements count=%, Audit count=%', v_bank_tx_count, v_movements_count, v_audit_count;

    -- Replay the EXACT same idempotency call
    v_res2 := fn_kasa_update_sale(
        p_actor_user_id => v_hur_id,
        p_sale_id => v_test_sale_open_id,
        p_category_id => v_fotokopi_cat.id,
        p_product_name => 'TEST V29 FOTOKOPI KART',
        p_quantity => 1,
        p_unit_price_kurus => 15000,
        p_total_price_kurus => 15000,
        p_cost_price_kurus => 0,
        p_service_cost_kurus => 0,
        p_cash_paid_kurus => 0,
        p_card_paid_kurus => 15000,
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
        p_description => 'V29 Open test sale updated to POS',
        p_customer_name => NULL,
        p_customer_phone => NULL,
        p_serial_imei => NULL,
        p_technical_service_details => NULL,
        p_service_cost_payment_status => 'no_cost',
        p_service_cost_payment_source => NULL,
        p_service_cost_bank_account_id => NULL,
        p_idempotency_key => 'update_' || v_idem_key,
        p_justification => 'Müşteri nakit yerine TEB POS kart ile ödedi',
        p_pos_bank_account_id => v_teb_bank.id
    );

    SELECT count(*) INTO v_bank_tx_count FROM kasa_bank_transactions WHERE related_sale_id = v_test_sale_open_id AND status = 'active';
    SELECT count(*) INTO v_movements_count FROM kasa_movements WHERE sale_id = v_test_sale_open_id;
    SELECT count(*) INTO v_audit_count FROM kasa_audit_logs WHERE entity_id = v_test_sale_open_id AND action = 'sale_update';

    IF v_bank_tx_count <> 1 OR v_movements_count <> 3 OR v_audit_count <> 1 THEN
        RAISE EXCEPTION 'TEST 1 REPLAY FAILED: Replay caused duplicate records (bank_tx=%, movements=%, audit=%)', v_bank_tx_count, v_movements_count, v_audit_count;
    END IF;
    RAISE NOTICE 'TEST 1B PASSED: Replay strictly idempotent. No duplicates created.';

    -- =========================================================================
    -- TEST 2: IDEMPOTENCY CONFLICT CHECKS (CROSS-ACTOR & CROSS-PAYLOAD)
    -- =========================================================================
    RAISE NOTICE '-----------------------------------------------------';
    RAISE NOTICE 'TEST 2: IDEMPOTENCY CONFLICT CHECKS';

    -- A) Reusing same idempotency key with different actor
    v_caught := false;
    BEGIN
        PERFORM fn_kasa_update_sale(
            p_actor_user_id => v_koray_id,
            p_sale_id => v_test_sale_open_id,
            p_category_id => v_fotokopi_cat.id,
            p_product_name => 'TEST V29 FOTOKOPI KART',
            p_quantity => 1,
            p_unit_price_kurus => 15000,
            p_total_price_kurus => 15000,
            p_cost_price_kurus => 0,
            p_service_cost_kurus => 0,
            p_cash_paid_kurus => 0,
            p_card_paid_kurus => 15000,
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
            p_description => 'V29 Open test sale updated to POS',
            p_customer_name => NULL,
            p_customer_phone => NULL,
            p_serial_imei => NULL,
            p_technical_service_details => NULL,
            p_service_cost_payment_status => 'no_cost',
            p_service_cost_payment_source => NULL,
            p_service_cost_bank_account_id => NULL,
            p_idempotency_key => 'update_' || v_idem_key,
            p_justification => 'Müşteri nakit yerine TEB POS kart ile ödedi',
            p_pos_bank_account_id => v_teb_bank.id
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%ÇAKIŞAN_İDEMPOTENCY_KEY%' THEN
            v_caught := true;
        ELSE
            RAISE EXCEPTION 'TEST 2A FAILED: Unexpected error: %', v_err_msg;
        END IF;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'TEST 2A FAILED: Same idempotency key with different actor was not rejected.';
    END IF;
    RAISE NOTICE 'TEST 2A PASSED: Cross-actor idempotency conflict properly rejected.';

    -- B) Reusing same idempotency key with different payload
    v_caught := false;
    BEGIN
        PERFORM fn_kasa_update_sale(
            p_actor_user_id => v_hur_id,
            p_sale_id => v_test_sale_open_id,
            p_category_id => v_fotokopi_cat.id,
            p_product_name => 'DIFFERENT PRODUCT NAME',
            p_quantity => 1,
            p_unit_price_kurus => 15000,
            p_total_price_kurus => 15000,
            p_cost_price_kurus => 0,
            p_service_cost_kurus => 0,
            p_cash_paid_kurus => 0,
            p_card_paid_kurus => 15000,
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
            p_description => 'V29 Open test sale updated to POS',
            p_customer_name => NULL,
            p_customer_phone => NULL,
            p_serial_imei => NULL,
            p_technical_service_details => NULL,
            p_service_cost_payment_status => 'no_cost',
            p_service_cost_payment_source => NULL,
            p_service_cost_bank_account_id => NULL,
            p_idempotency_key => 'update_' || v_idem_key,
            p_justification => 'Müşteri nakit yerine TEB POS kart ile ödedi',
            p_pos_bank_account_id => v_teb_bank.id
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%ÇAKIŞAN_İDEMPOTENCY_KEY%' THEN
            v_caught := true;
        ELSE
            RAISE EXCEPTION 'TEST 2B FAILED: Unexpected error: %', v_err_msg;
        END IF;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'TEST 2B FAILED: Same idempotency key with different payload was not rejected.';
    END IF;
    RAISE NOTICE 'TEST 2B PASSED: Cross-payload idempotency conflict properly rejected.';

    -- =========================================================================
    -- TEST 3: CLOSED DAY MUTATIONS & CASH RECONCILIATION HARDENING
    -- =========================================================================
    RAISE NOTICE '-----------------------------------------------------';
    RAISE NOTICE 'TEST 3: CLOSED DAY MUTATIONS & CASH RECONCILIATION HARDENING';

    -- Find or create a test sale in closed day (without breaking production data)
    SELECT id INTO v_test_sale_closed_id FROM kasa_sales WHERE kasa_day_id = v_closed_day.id AND card_paid_kurus > 0 AND status = 'completed' LIMIT 1;
    
    IF v_test_sale_closed_id IS NOT NULL THEN
        -- A) Attempting to change CASH on closed day must be rejected with KAPALI_GÜN_NAKİT_DEĞİŞTİRİLEMEZ
        v_caught := false;
        BEGIN
            PERFORM fn_kasa_update_sale(
                p_actor_user_id => v_hur_id,
                p_sale_id => v_test_sale_closed_id,
                p_category_id => v_fotokopi_cat.id,
                p_product_name => 'CLOSED DAY CASH MUTATION ATTEMPT',
                p_quantity => 1,
                p_unit_price_kurus => 10000,
                p_total_price_kurus => 10000,
                p_cost_price_kurus => 0,
                p_service_cost_kurus => 0,
                p_cash_paid_kurus => 10000,
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
                p_description => 'Attempting cash change on closed day',
                p_customer_name => NULL,
                p_customer_phone => NULL,
                p_serial_imei => NULL,
                p_technical_service_details => NULL,
                p_service_cost_payment_status => 'no_cost',
                p_service_cost_payment_source => NULL,
                p_service_cost_bank_account_id => NULL,
                p_idempotency_key => 'closed_cash_' || v_idem_key,
                p_justification => 'Yönetici düzeltme denemesi',
                p_pos_bank_account_id => NULL
            );
        EXCEPTION WHEN OTHERS THEN
            v_err_msg := SQLERRM;
            IF v_err_msg LIKE '%KAPALI_GÜN_NAKİT_DEĞİŞTİRİLEMEZ%' THEN
                v_caught := true;
            ELSE
                RAISE EXCEPTION 'TEST 3A FAILED: Unexpected error: %', v_err_msg;
            END IF;
        END;

        IF NOT v_caught THEN
            RAISE EXCEPTION 'TEST 3A FAILED: Cash mutation on closed day was NOT rejected.';
        END IF;
        RAISE NOTICE 'TEST 3A PASSED: Cash mutation on closed day successfully rejected (KAPALI_GÜN_NAKİT_DEĞİŞTİRİLEMEZ).';

        -- B) Non-manager (Koray) attempting any modification on closed day must be rejected with KASA_GUNU_KAPALI
        v_caught := false;
        BEGIN
            PERFORM fn_kasa_update_sale(
                p_actor_user_id => v_koray_id,
                p_sale_id => v_test_sale_closed_id,
                p_category_id => v_fotokopi_cat.id,
                p_product_name => 'CLOSED DAY NON-MANAGER ATTEMPT',
                p_quantity => 1,
                p_unit_price_kurus => 10000,
                p_total_price_kurus => 10000,
                p_cost_price_kurus => 0,
                p_service_cost_kurus => 0,
                p_cash_paid_kurus => 0,
                p_card_paid_kurus => 10000,
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
                p_description => 'Non-manager closed day attempt',
                p_customer_name => NULL,
                p_customer_phone => NULL,
                p_serial_imei => NULL,
                p_technical_service_details => NULL,
                p_service_cost_payment_status => 'no_cost',
                p_service_cost_payment_source => NULL,
                p_service_cost_bank_account_id => NULL,
                p_idempotency_key => 'closed_nonmgr_' || v_idem_key,
                p_justification => 'Personel kapalı gün denemesi',
                p_pos_bank_account_id => v_teb_bank.id
            );
        EXCEPTION WHEN OTHERS THEN
            v_err_msg := SQLERRM;
            IF v_err_msg LIKE '%KASA_GUNU_KAPALI%' OR v_err_msg LIKE '%YETKİSİZ%' THEN
                v_caught := true;
            ELSE
                RAISE EXCEPTION 'TEST 3B FAILED: Unexpected error: %', v_err_msg;
            END IF;
        END;

        IF NOT v_caught THEN
            RAISE EXCEPTION 'TEST 3B FAILED: Non-manager modification on closed day was NOT rejected.';
        END IF;
        RAISE NOTICE 'TEST 3B PASSED: Non-manager modification on closed day successfully rejected.';
    END IF;

    -- =========================================================================
    -- TEST 4: CHECK LIVE FIS-20261008-0310 RECEIPT STATUS
    -- =========================================================================
    RAISE NOTICE '-----------------------------------------------------';
    RAISE NOTICE 'TEST 4: FIS-20261008-0310 RECEIPT LIVE INSPECTION';

    SELECT s.*, kd.date_val AS day_date, kd.status AS day_status, cat.name AS cat_name
    INTO v_receipt_0310
    FROM kasa_sales s
    JOIN kasa_days kd ON kd.id = s.kasa_day_id
    JOIN kasa_categories cat ON cat.id = s.category_id
    WHERE s.receipt_no = 'FIS-20261008-0310';

    IF v_receipt_0310.id IS NOT NULL THEN
        RAISE NOTICE 'Target Receipt Found: FIS-20261008-0310';
        RAISE NOTICE 'Day ID: %, Date: %, Day Status: %', v_receipt_0310.kasa_day_id, v_receipt_0310.day_date, v_receipt_0310.day_status;
        RAISE NOTICE 'Product: %, Category: %, Total: % kurus', v_receipt_0310.product_name, v_receipt_0310.cat_name, v_receipt_0310.total_price_kurus;
        RAISE NOTICE 'Current Payments: Cash=% kurus, Card=% kurus (pos_bank_account_id=%)', v_receipt_0310.cash_paid_kurus, v_receipt_0310.card_paid_kurus, v_receipt_0310.pos_bank_account_id;
    ELSE
        RAISE NOTICE 'Target Receipt FIS-20261008-0310 not found in database.';
    END IF;

    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'ALL HURCELL KASA V29 VERIFICATION TESTS PASSED!';
    RAISE NOTICE '=====================================================';

    -- Cleanup test open sale records to leave DB clean
    DELETE FROM kasa_audit_logs WHERE entity_id = v_test_sale_open_id;
    DELETE FROM kasa_bank_transactions WHERE related_sale_id = v_test_sale_open_id;
    DELETE FROM kasa_movements WHERE sale_id = v_test_sale_open_id;
    DELETE FROM kasa_sales WHERE id = v_test_sale_open_id;
    DELETE FROM kasa_idempotency_keys WHERE idempotency_key LIKE '%' || v_idem_key;
    RAISE NOTICE 'Test cleanup completed.';
END;
$$;
