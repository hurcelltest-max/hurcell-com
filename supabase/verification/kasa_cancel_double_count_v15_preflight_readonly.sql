-- ============================================================================
-- HurCELL Kasa V15 - İptal Tutarının Çift Düşülmesi Teşhis Sorgusu (Salt-Okunur Preflight)
-- Hedef Gün: 2026-09-02
-- Amaç:
--  1. Açılış bakiyesi, tamamlanmış nakit satış, brüt satis hareketleri, iptal/iade çıkışları
--     ve genel giderleri ayrı ayrı izole etmek.
--  2. fn_kasa_get_physical_cash RPC'sinin doğru kanonik bakiye (2.615.000 kuruş) ürettiğini
--     ve iptali ikinci kez düşmediğini kanıtlamak.
--  3. satis_duzeltme_iptal hareketini normal satış iptalinden (iptal/iade) ayrı sınıflandırmak.
--  4. TypeScript/Frontend katmanındaki çift düşüm tutarını (50.000 kuruş / 500 TL)
--     ve düzeltilmiş kâr/zarar farkını (709.000 vs 659.000 kuruş) net olarak göstermek.
-- KESİN KURAL: Yalnız SELECT ve CTE; kesinlikle DML içermez.
-- ============================================================================

WITH target_day AS (
    SELECT *
    FROM public.kasa_days
    WHERE date_val = DATE '2026-09-02'
    LIMIT 1
),
sales_breakdown AS (
    SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN cash_paid_kurus ELSE 0 END), 0) AS completed_cash_sales_kurus,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN card_paid_kurus ELSE 0 END), 0) AS completed_card_sales_kurus,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN bank_transfer_paid_kurus ELSE 0 END), 0) AS completed_bank_transfer_sales_kurus,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_price_kurus ELSE 0 END), 0) AS completed_gross_sales_kurus,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN cash_paid_kurus ELSE 0 END), 0) AS cancelled_cash_sales_kurus,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_price_kurus ELSE 0 END), 0) AS cancelled_gross_sales_kurus,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_sales_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_sales_count
    FROM public.kasa_sales
    WHERE kasa_day_id = (SELECT id FROM target_day)
),
movements_breakdown AS (
    SELECT
        -- Orijinal Brüt Satış Hareketleri
        COALESCE(SUM(CASE WHEN movement_type = 'satis' THEN cash_portion_kurus ELSE 0 END), 0) AS gross_satis_movement_cash_kurus,
        COALESCE(SUM(CASE WHEN movement_type = 'satis' THEN amount_kurus ELSE 0 END), 0) AS gross_satis_movement_amount_kurus,
        -- Kesin Normal Satış İptalleri ve İadeleri (İptal Edilmiş Satışlar)
        COALESCE(SUM(CASE WHEN movement_type IN ('iptal', 'iade') THEN ABS(cash_portion_kurus) ELSE 0 END), 0) AS cancel_refund_cash_out_kurus,
        COALESCE(SUM(CASE WHEN movement_type IN ('iptal', 'iade') THEN ABS(amount_kurus) ELSE 0 END), 0) AS cancel_refund_amount_out_kurus,
        -- Düzeltme Hareketleri (Ayrı Sınıflandırma)
        COALESCE(SUM(CASE WHEN movement_type = 'satis_duzeltme_iptal' THEN ABS(cash_portion_kurus) ELSE 0 END), 0) AS correction_reversal_cash_out_kurus,
        COALESCE(SUM(CASE WHEN movement_type = 'satis_duzeltme_yeni' THEN cash_portion_kurus ELSE 0 END), 0) AS correction_new_cash_in_kurus,
        -- Genel Gider Çıkışları
        COALESCE(SUM(CASE WHEN movement_type IN ('nakit_gider', 'salary_payment') THEN ABS(cash_portion_kurus) ELSE 0 END), 0) AS expense_movement_cash_out_kurus
    FROM public.kasa_movements
    WHERE kasa_day_id = (SELECT id FROM target_day)
),
expenses_breakdown AS (
    SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_kurus ELSE 0 END), 0) AS active_cash_expenses_kurus,
        COALESCE(SUM(CASE WHEN payment_method = 'bank' THEN amount_kurus ELSE 0 END), 0) AS active_bank_expenses_kurus,
        COALESCE(SUM(amount_kurus), 0) AS total_active_expenses_kurus,
        COUNT(*) AS active_expenses_count
    FROM public.kasa_expenses
    WHERE kasa_day_id = (SELECT id FROM target_day)
      AND (status = 'active' OR status IS NULL)
),
other_transfers AS (
    SELECT
        (SELECT COALESCE(SUM(amount_kurus), 0) FROM public.kasa_credit_payments WHERE kasa_day_id = (SELECT id FROM target_day)) AS credit_payments_cash_kurus,
        (SELECT COALESCE(SUM(amount_kurus), 0) FROM public.kasa_bank_deposits WHERE kasa_day_id = (SELECT id FROM target_day)) AS bank_deposits_cash_kurus,
        (SELECT COALESCE(SUM(tl_equivalent_kurus), 0) FROM public.kasa_fx_transactions WHERE kasa_day_id = (SELECT id FROM target_day) AND transaction_type = 'fx_conversion_to_try') AS fx_try_kurus,
        (SELECT COALESCE(SUM(cash_portion_kurus), 0) FROM public.kasa_movements WHERE kasa_day_id = (SELECT id FROM target_day) AND movement_type IN ('ts_cost_cash_payment', 'ts_cost_cash_refund')) AS ts_net_cash_kurus
),
canonical_computation AS (
    SELECT
        d.id AS day_id,
        d.date_val,
        d.status AS day_status,
        d.opening_balance_kurus,
        d.capital_injected_kurus,
        d.owner_withdrawn_kurus,
        sb.completed_cash_sales_kurus,
        sb.completed_card_sales_kurus,
        sb.completed_gross_sales_kurus,
        sb.cancelled_cash_sales_kurus,
        mb.gross_satis_movement_cash_kurus,
        mb.cancel_refund_cash_out_kurus,
        mb.correction_reversal_cash_out_kurus,
        mb.correction_new_cash_in_kurus,
        eb.active_cash_expenses_kurus,
        ot.credit_payments_cash_kurus,
        ot.bank_deposits_cash_kurus,
        ot.fx_try_kurus,
        ot.ts_net_cash_kurus,
        public.fn_kasa_get_physical_cash(d.id) AS rpc_physical_cash_kurus,
        -- Doğru Kanonik Fiziksel Kasa: Açılış + Sermaye - Çekim + Net Satış Nakit + Cari + FX + TS Net - Nakit Gider - Banka Yatırma
        (d.opening_balance_kurus + d.capital_injected_kurus - d.owner_withdrawn_kurus
         + sb.completed_cash_sales_kurus + ot.credit_payments_cash_kurus + ot.fx_try_kurus + ot.ts_net_cash_kurus
         - eb.active_cash_expenses_kurus - ot.bank_deposits_cash_kurus) AS correct_canonical_physical_cash_kurus,
        -- Doğru Net Günlük Kasa Etkisi: Net Satış Nakit - Nakit Gider
        (sb.completed_cash_sales_kurus - eb.active_cash_expenses_kurus) AS correct_net_cash_effect_kurus,
        -- Doğru Tahmini Kâr / Zarar: Brüt Ciro - Genel Giderler
        (sb.completed_gross_sales_kurus - eb.total_active_expenses_kurus) AS correct_estimated_profit_kurus,
        -- Hatalı Çift Düşülmüş Fiziksel Kasa (Eski UI/Service formülü):
        (d.opening_balance_kurus + d.capital_injected_kurus - d.owner_withdrawn_kurus
         + sb.completed_cash_sales_kurus + ot.credit_payments_cash_kurus + ot.fx_try_kurus + ot.ts_net_cash_kurus
         - eb.active_cash_expenses_kurus - ot.bank_deposits_cash_kurus - mb.cancel_refund_cash_out_kurus) AS erroneous_double_deducted_physical_cash_kurus,
        -- Hatalı Çift Düşülmüş Kâr / Zarar:
        (sb.completed_gross_sales_kurus - eb.total_active_expenses_kurus - mb.cancel_refund_amount_out_kurus) AS erroneous_double_deducted_profit_kurus,
        -- Çift Düşüm Fark Tutarı:
        mb.cancel_refund_cash_out_kurus AS double_deduction_delta_kurus
    FROM target_day d
    CROSS JOIN sales_breakdown sb
    CROSS JOIN movements_breakdown mb
    CROSS JOIN expenses_breakdown eb
    CROSS JOIN other_transfers ot
)
SELECT jsonb_build_object(
    'preflight_timestamp', now(),
    'day_date', date_val,
    'day_status', day_status,
    'opening_balance_kurus', opening_balance_kurus,
    'completed_cash_sales_kurus', completed_cash_sales_kurus,
    'gross_satis_movement_cash_kurus', gross_satis_movement_cash_kurus,
    'cancel_refund_cash_out_kurus', cancel_refund_cash_out_kurus,
    'correction_reversal_cash_out_kurus', correction_reversal_cash_out_kurus,
    'correction_new_cash_in_kurus', correction_new_cash_in_kurus,
    'active_cash_expenses_kurus', active_cash_expenses_kurus,
    'rpc_physical_cash_kurus', rpc_physical_cash_kurus,
    'correct_canonical_physical_cash_kurus', correct_canonical_physical_cash_kurus,
    'correct_net_cash_effect_kurus', correct_net_cash_effect_kurus,
    'correct_estimated_profit_kurus', correct_estimated_profit_kurus,
    'erroneous_double_deducted_physical_cash_kurus', erroneous_double_deducted_physical_cash_kurus,
    'erroneous_double_deducted_profit_kurus', erroneous_double_deducted_profit_kurus,
    'double_deduction_delta_kurus', double_deduction_delta_kurus,
    'validation', jsonb_build_object(
        'is_rpc_physical_cash_correct', (rpc_physical_cash_kurus = 2615000),
        'is_correct_canonical_physical_cash_26150TL', (correct_canonical_physical_cash_kurus = 2615000),
        'is_correct_net_cash_effect_7065TL', (correct_net_cash_effect_kurus = 706500),
        'is_correct_estimated_profit_7090TL', (correct_estimated_profit_kurus = 709000),
        'is_erroneous_physical_cash_25650TL', (erroneous_double_deducted_physical_cash_kurus = 2565000),
        'is_erroneous_profit_6590TL', (erroneous_double_deducted_profit_kurus = 659000),
        'is_double_deduction_exactly_500TL', (double_deduction_delta_kurus = 50000)
    )
) AS preflight_result
FROM canonical_computation;
