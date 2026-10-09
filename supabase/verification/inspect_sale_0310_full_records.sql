SELECT 
    'audit_log' as record_type,
    id::text,
    action,
    entity_type,
    details::text,
    created_at::text
FROM kasa_audit_logs 
WHERE entity_id = 'b99b1b6c-0857-4b40-a1f4-55b4fa0894ed'
UNION ALL
SELECT 
    'bank_tx' as record_type,
    id::text,
    transaction_type as action,
    status as entity_type,
    ('amount_kurus: ' || amount_kurus || ', bank_id: ' || bank_account_id) as details,
    created_at::text
FROM kasa_bank_transactions 
WHERE related_sale_id = 'b99b1b6c-0857-4b40-a1f4-55b4fa0894ed'
UNION ALL
SELECT 
    'movement' as record_type,
    id::text,
    movement_type as action,
    ('cash: ' || cash_portion_kurus || ', card: ' || card_portion_kurus) as entity_type,
    description as details,
    created_at::text
FROM kasa_movements 
WHERE sale_id = 'b99b1b6c-0857-4b40-a1f4-55b4fa0894ed'
ORDER BY created_at ASC;
