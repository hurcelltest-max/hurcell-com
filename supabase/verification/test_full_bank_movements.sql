-- Complete test query combining all bank and transfer records for October 2026
WITH days_in_range AS (
    SELECT id, date_val FROM kasa_days WHERE date_val >= '2026-10-01' AND date_val <= '2026-10-09'
),
sales_transfers AS (
    SELECT 
        s.id::text as id,
        'sale_transfer' as source_type,
        'Havale / EFT Satış Tahsilatı' as type_label,
        d.date_val::text as date,
        to_char(s.created_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') as time,
        'in' as direction,
        s.bank_transfer_paid_kurus as amount_kurus,
        COALESCE(s.bank_transfer_reference, 'Banka / Havale') as bank_name,
        COALESCE(s.bank_transfer_reference, '') as account_name,
        ('Satış: ' || s.product_name || ' (' || s.receipt_no || ')' || CASE WHEN s.bank_transfer_reference IS NOT NULL THEN ' - Ref: ' || s.bank_transfer_reference ELSE '' END) as description,
        s.bank_transfer_reference as reference_no,
        s.receipt_no as receipt_no,
        COALESCE(u.full_name, u.username, 'Sistem') as created_by_name,
        true as is_operating_revenue,
        false as is_operating_expense,
        false as is_adjustment,
        false as is_transfer,
        s.created_at::text as created_at
    FROM kasa_sales s
    JOIN days_in_range d ON d.id = s.kasa_day_id
    LEFT JOIN kasa_users u ON u.id = s.created_by_user_id
    WHERE s.bank_transfer_paid_kurus > 0 AND s.status = 'completed'
),
credit_transfers AS (
    SELECT 
        cp.id::text as id,
        'credit_transfer' as source_type,
        'Havale / EFT Cari Tahsilat' as type_label,
        d.date_val::text as date,
        to_char(cp.created_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') as time,
        'in' as direction,
        cp.bank_transfer_paid_kurus as amount_kurus,
        COALESCE(cp.bank_transfer_reference, 'Banka / Havale') as bank_name,
        COALESCE(cp.bank_transfer_reference, '') as account_name,
        ('Cari Tahsilat: ' || COALESCE(cc.full_name, 'Müşteri') || CASE WHEN cp.bank_transfer_reference IS NOT NULL THEN ' - Ref: ' || cp.bank_transfer_reference ELSE '' END) as description,
        cp.bank_transfer_reference as reference_no,
        null as receipt_no,
        COALESCE(u.full_name, u.username, 'Sistem') as created_by_name,
        true as is_operating_revenue,
        false as is_operating_expense,
        false as is_adjustment,
        false as is_transfer,
        cp.created_at::text as created_at
    FROM kasa_credit_payments cp
    JOIN days_in_range d ON d.id = cp.kasa_day_id
    LEFT JOIN credit_customers cc ON cc.id = cp.credit_customer_id
    LEFT JOIN kasa_users u ON u.id = cp.created_by_user_id
    WHERE cp.bank_transfer_paid_kurus > 0
),
bank_txs AS (
    SELECT 
        bt.id::text as id,
        bt.transaction_type as source_type,
        CASE 
            WHEN bt.transaction_type = 'pos_collection' THEN 'POS / Kart Tahsilatı'
            WHEN bt.transaction_type = 'bank_expense' THEN 'Banka Gideri'
            WHEN bt.transaction_type = 'balance_adjustment' THEN 'Banka Bakiye Düzeltmesi'
            WHEN bt.transaction_type IN ('transfer', 'transfer_in', 'transfer_out') THEN 'Bankalar Arası Transfer'
            WHEN bt.transaction_type IN ('bank_deposit', 'deposit') THEN 'Kasadan Bankaya Yatırma'
            WHEN bt.transaction_type = 'owner_withdrawal' THEN 'Şahsi Çekim (Banka)'
            WHEN bt.transaction_type = 'capital_injection' THEN 'Sermaye Girişi (Banka)'
            WHEN bt.transaction_type = 'ts_cost_payment' THEN 'Teknik Servis Maliyeti (Banka)'
            ELSE bt.transaction_type
        END as type_label,
        bt.transaction_date::text as date,
        to_char(bt.created_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') as time,
        bt.direction,
        bt.amount_kurus,
        COALESCE(ba.bank_name, 'Banka') as bank_name,
        COALESCE(ba.account_name, '') as account_name,
        COALESCE(bt.description, bt.transaction_type) as description,
        bt.reference_no,
        null as receipt_no,
        COALESCE(u.full_name, u.username, 'Sistem') as created_by_name,
        (bt.transaction_type = 'pos_collection') as is_operating_revenue,
        (bt.transaction_type IN ('bank_expense', 'ts_cost_payment')) as is_operating_expense,
        (bt.transaction_type = 'balance_adjustment') as is_adjustment,
        (bt.transaction_type IN ('transfer', 'transfer_in', 'transfer_out', 'bank_deposit', 'deposit', 'owner_withdrawal', 'capital_injection')) as is_transfer,
        bt.created_at::text as created_at
    FROM kasa_bank_transactions bt
    LEFT JOIN kasa_bank_accounts ba ON ba.id = bt.bank_account_id
    LEFT JOIN kasa_users u ON u.id = bt.created_by_user_id
    WHERE (bt.transaction_date >= '2026-10-01' AND bt.transaction_date <= '2026-10-09')
      AND bt.status = 'active'
),
unlinked_bank_expenses AS (
    SELECT 
        e.id::text as id,
        'bank_expense' as source_type,
        'Banka Gideri' as type_label,
        d.date_val::text as date,
        to_char(e.created_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') as time,
        'out' as direction,
        e.amount_kurus,
        COALESCE(ba.bank_name, 'Banka') as bank_name,
        COALESCE(ba.account_name, '') as account_name,
        (COALESCE(e.description, 'Gider') || CASE WHEN e.recipient_name IS NOT NULL THEN ' (Alıcı: ' || e.recipient_name || ')' ELSE '' END) as description,
        null as reference_no,
        null as receipt_no,
        COALESCE(u.full_name, u.username, 'Sistem') as created_by_name,
        false as is_operating_revenue,
        true as is_operating_expense,
        false as is_adjustment,
        false as is_transfer,
        e.created_at::text as created_at
    FROM kasa_expenses e
    JOIN days_in_range d ON d.id = e.kasa_day_id
    LEFT JOIN kasa_bank_accounts ba ON ba.id = e.bank_account_id
    LEFT JOIN kasa_users u ON u.id = e.created_by_user_id
    WHERE e.payment_method = 'bank' AND e.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM kasa_bank_transactions bt 
          WHERE bt.related_expense_id = e.id OR (bt.transaction_type = 'bank_expense' AND bt.amount_kurus = e.amount_kurus AND bt.bank_account_id = e.bank_account_id AND bt.transaction_date = d.date_val)
      )
)
SELECT * FROM (
    SELECT * FROM sales_transfers
    UNION ALL
    SELECT * FROM credit_transfers
    UNION ALL
    SELECT * FROM bank_txs
    UNION ALL
    SELECT * FROM unlinked_bank_expenses
) all_items
ORDER BY date DESC, created_at DESC;
