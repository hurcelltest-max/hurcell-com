-- 1. Show TEB before recalculation
-- 2. Recalculate TEB balance using canonical fn_kasa_recalculate_bank_balance
-- 3. Show TEB after recalculation
DO $$
DECLARE
    v_teb_id uuid := 'b30b183e-3cc7-4a25-9e97-f6ca4968b777';
    v_old_balance bigint;
    v_new_balance bigint;
    v_expected bigint;
BEGIN
    SELECT current_balance_kurus INTO v_old_balance FROM kasa_bank_accounts WHERE id = v_teb_id;
    
    -- Recalculate
    v_new_balance := fn_kasa_recalculate_bank_balance(v_teb_id);
    
    RAISE NOTICE 'TEB Balance Recalculated: Old Balance = % kurus, New Balance = % kurus', v_old_balance, v_new_balance;
END;
$$;

SELECT 
    b.id,
    b.bank_name,
    b.account_name,
    b.currency_code,
    b.opening_balance_kurus,
    b.current_balance_kurus,
    COALESCE(SUM(CASE WHEN t.direction = 'in' AND t.status = 'active' THEN t.amount_kurus ELSE 0 END), 0) AS total_in_kurus,
    COALESCE(SUM(CASE WHEN t.direction = 'out' AND t.status = 'active' THEN t.amount_kurus ELSE 0 END), 0) AS total_out_kurus,
    b.opening_balance_kurus + 
    COALESCE(SUM(CASE WHEN t.direction = 'in' AND t.status = 'active' THEN t.amount_kurus ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN t.direction = 'out' AND t.status = 'active' THEN t.amount_kurus ELSE 0 END), 0) AS expected_balance_kurus,
    b.current_balance_kurus - (
        b.opening_balance_kurus + 
        COALESCE(SUM(CASE WHEN t.direction = 'in' AND t.status = 'active' THEN t.amount_kurus ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN t.direction = 'out' AND t.status = 'active' THEN t.amount_kurus ELSE 0 END), 0)
    ) AS difference_kurus
FROM kasa_bank_accounts b
LEFT JOIN kasa_bank_transactions t ON t.bank_account_id = b.id
WHERE b.id = 'b30b183e-3cc7-4a25-9e97-f6ca4968b777'
GROUP BY b.id, b.bank_name, b.account_name, b.currency_code, b.opening_balance_kurus, b.current_balance_kurus;
