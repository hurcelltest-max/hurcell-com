-- supabase/tests/finance_mvp_production_smoke.sql
-- Production functional smoke tests (wrapped in rollback)

BEGIN;

CREATE TEMP TABLE smoke_runs (
    check_id INT PRIMARY KEY,
    check_name TEXT,
    result TEXT,
    details TEXT
);

DO $$
DECLARE
    v_customer_id UUID := gen_random_uuid();
    v_account_id UUID := gen_random_uuid();
    v_collection_time TIMESTAMPTZ := clock_timestamp();
    v_plan_id UUID;
BEGIN
    -- Setup Test Customer & Account
    INSERT INTO public.credit_customers (id, full_name, phone, phone_normalized, status)
    VALUES (v_customer_id, 'TEST-SMOKE-HURCELL', '+905555555999', '+905555555999', 'active');

    INSERT INTO public.credit_accounts (id, credit_customer_id, credit_limit, current_balance, statement_day, status)
    VALUES (v_account_id, v_customer_id, 10000.00, 0.00, 15, 'active');

    INSERT INTO smoke_runs VALUES (1, 'Customer and account setup', 'PASS', 'Customer and account created');

    -- T2: Create Finance Plan
    BEGIN
        PERFORM public.create_finance_plan(
            'smoke_key_plan_1',
            v_customer_id,
            'store_sale',
            'smoke_ref_1',
            1000.00,
            200.00,
            10.0000,
            3,
            15,
            (current_date + interval '1 month')::date,
            'admin_smoke',
            'cash'
        );
        
        v_plan_id := (SELECT id FROM public.finance_plans WHERE idempotency_key = 'smoke_key_plan_1');
        
        IF v_plan_id IS NOT NULL AND 
           (SELECT current_balance FROM public.credit_accounts WHERE id = v_account_id) = 880.00 THEN
            INSERT INTO smoke_runs VALUES (2, 'Finance plan creation', 'PASS', 'Plan created with down payment and vade farki');
        ELSE
            INSERT INTO smoke_runs VALUES (2, 'Finance plan creation', 'FAIL', 'Plan creation failed or balance mismatch');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO smoke_runs VALUES (2, 'Finance plan creation', 'FAIL', SQLERRM);
    END;

    -- T3: Record Installment Payment
    BEGIN
        PERFORM public.record_finance_collection(
            'smoke_key_col_1',
            v_plan_id,
            100.00,
            'cash',
            'installment_payment',
            v_collection_time,
            'admin_smoke',
            'smoke payment'
        );
        
        IF (SELECT current_balance FROM public.credit_accounts WHERE id = v_account_id) = 780.00 AND
           (SELECT amount_paid FROM public.finance_installments WHERE finance_plan_id = v_plan_id AND installment_no = 1) = 100.00 THEN
            INSERT INTO smoke_runs VALUES (3, 'Record installment payment', 'PASS', 'Collection recorded, first installment updated');
        ELSE
            INSERT INTO smoke_runs VALUES (3, 'Record installment payment', 'FAIL', 'Payment failed or status/balance mismatch');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO smoke_runs VALUES (3, 'Record installment payment', 'FAIL', SQLERRM);
    END;

    -- T4: Cancel Finance Plan
    BEGIN
        PERFORM public.cancel_finance_plan(
            v_plan_id,
            'admin_smoke',
            'Smoke test cancellation'
        );
        
        IF (SELECT status FROM public.finance_plans WHERE id = v_plan_id) = 'cancelled' AND
           (SELECT current_balance FROM public.credit_accounts WHERE id = v_account_id) = 0.00 THEN
            INSERT INTO smoke_runs VALUES (4, 'Cancel finance plan', 'PASS', 'Plan cancelled and balance fully restored to 0.00');
        ELSE
            INSERT INTO smoke_runs VALUES (4, 'Cancel finance plan', 'FAIL', 'Cancellation failed or balance not restored');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO smoke_runs VALUES (4, 'Cancel finance plan', 'FAIL', SQLERRM);
    END;

END;
$$;

SELECT * FROM smoke_runs ORDER BY check_id ASC;

ROLLBACK;
