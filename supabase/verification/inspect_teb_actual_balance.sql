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
WHERE b.bank_name = 'TEB'
GROUP BY b.id, b.bank_name, b.account_name, b.currency_code, b.opening_balance_kurus, b.current_balance_kurus;
