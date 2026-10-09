-- Inspect receipt FIS-20261008-0310 details and status
SELECT 
    s.id,
    s.receipt_no,
    s.product_name,
    c.name AS category_name,
    s.total_price_kurus,
    s.cash_paid_kurus,
    s.card_paid_kurus,
    s.pos_bank_account_id,
    b.bank_name AS pos_bank_name,
    kd.date_val AS day_date,
    kd.status AS day_status,
    kd.closed_at
FROM kasa_sales s
JOIN kasa_days kd ON kd.id = s.kasa_day_id
JOIN kasa_categories c ON c.id = s.category_id
LEFT JOIN kasa_bank_accounts b ON b.id = s.pos_bank_account_id
WHERE s.receipt_no = 'FIS-20261008-0310';
