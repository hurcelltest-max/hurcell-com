-- Migration: 20260825100000_kasa_three_features_and_categories.sql
-- Description: Update cash reserve target to 15.000 TL (1.500.000 kurus), seed missing expense categories, update chk_kasa_movements_type constraint safely, and update fn_kasa_create_expense & fn_kasa_update_sale RPCs with strict role security and cash adequacy enforcement.

BEGIN;

-- 1. Update Kasa Target Reserve Setting to 15.000 TL (1.500.000 kurus) on single settings row
UPDATE public.kasa_settings
SET cash_reserve_target_kurus = 1500000
WHERE id = (SELECT id FROM public.kasa_settings ORDER BY id LIMIT 1);

INSERT INTO public.kasa_settings (cash_reserve_target_kurus)
SELECT 1500000 WHERE NOT EXISTS (SELECT 1 FROM public.kasa_settings);

-- 2. Ensure all required Expense Categories exist cleanly without duplicates
INSERT INTO public.kasa_expense_categories (name, display_order, is_salary_category) VALUES
('Personel Maaşı', 1, true),
('Teknik Servis Gideri', 2, false),
('Yedek Parça', 3, false),
('Ürün Alışverişi', 4, false),
('Temizlik / Ofis Gideri', 5, false),
('Ofis Alışverişi', 6, false),
('Kira', 7, false),
('Elektrik', 8, false),
('Su', 9, false),
('İnternet / Telefon', 10, false),
('Kargo Gideri', 11, false),
('Yemek / İkram', 12, false),
('POS / Banka Komisyonu', 13, false),
('Vergi / Resmi Ödeme', 14, false),
('Diğer', 15, false)
ON CONFLICT (name) DO NOTHING;

-- 3. Update kasa_movements movement_type CHECK constraint safely preserving all existing allowed movement types
ALTER TABLE public.kasa_movements DROP CONSTRAINT IF EXISTS chk_kasa_movements_type;
ALTER TABLE public.kasa_movements ADD CONSTRAINT chk_kasa_movements_type CHECK (movement_type IN (
    'satis', 'nakit_tahsilat', 'kredi_karti_tahsilat', 'bank_transfer_tahsilat', 'nakit_gider', 'iade', 'iptal', 'acilis_bakiyesi', 'gun_sonu_kapanis',
    'capital_injection', 'owner_withdrawal', 'cash_carry_forward', 'salary_payment', 'technical_service_revenue',
    'technical_service_expense', 'inventory_purchase', 'bank_deposit', 'fx_sale_payment', 'fx_capital_injection',
    'fx_conversion_to_try', 'fx_bank_deposit', 'fx_return', 'credit_tahsilat', 'satis_duzeltme_iptal', 'satis_duzeltme_yeni'
));

-- 4. SECURE RPC: GİDER / MAAŞ KAYDI OLUŞTURMA (PERSONEL MAAŞ DIŞI GİDER EKLEYEBİLİR, MAAŞ YALNIZCA YÖNETİCİ)
DROP FUNCTION IF EXISTS public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.fn_kasa_create_expense(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_expense_category_id UUID,
    p_amount_kurus BIGINT,
    p_description TEXT,
    p_recipient_name TEXT DEFAULT NULL,
    p_sale_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_category public.kasa_expense_categories%ROWTYPE;
    v_expense public.kasa_expenses%ROWTYPE;
    v_movement_type TEXT := 'nakit_gider';
    v_total_cash_sales BIGINT := 0;
    v_total_cash_credit_payments BIGINT := 0;
    v_total_cash_expenses BIGINT := 0;
    v_total_bank_deposits BIGINT := 0;
    v_total_fx_conversions BIGINT := 0;
    v_current_cash BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider tutarı 0 veya negatif olamaz.';
    END IF;

    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Gider açıklaması zorunludur.';
    END IF;

    SELECT * INTO v_category FROM public.kasa_expense_categories WHERE id = p_expense_category_id;
    IF v_category.id IS NULL OR NOT v_category.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Seçilen gider kategorisi bulunamadı veya pasif.';
    END IF;

    -- ROL GÜVENLİĞİ: PERSONEL MAAŞ GİDERİ GİREMEZ! (DB SEVİYESİNDE KESİN ENGEL)
    IF v_category.is_salary_category = true AND v_actor.role <> 'yonetici' THEN
        RAISE EXCEPTION 'YETKİSİZ: Personel maaşı kaydı yalnızca yöneticiler tarafından eklenebilir.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Gün bulunamadı veya kapalı.';
    END IF;

    -- FİZİKSEL NAKİT HESABI (Nakit satışlar + Nakit cari tahsilatları + Döviz bozumları dahil)
    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_sales
    FROM public.kasa_sales WHERE kasa_day_id = p_kasa_day_id AND status = 'completed';

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_credit_payments
    FROM public.kasa_credit_payments WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_cash_expenses
    FROM public.kasa_expenses WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_bank_deposits
    FROM public.kasa_bank_deposits WHERE kasa_day_id = p_kasa_day_id;

    SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_total_fx_conversions
    FROM public.kasa_fx_transactions WHERE kasa_day_id = p_kasa_day_id AND transaction_type = 'fx_conversion_to_try';

    v_current_cash := v_day.opening_balance_kurus + v_day.capital_injected_kurus - v_day.owner_withdrawn_kurus + v_total_cash_sales + v_total_cash_credit_payments + v_total_fx_conversions - v_total_cash_expenses - v_total_bank_deposits;

    IF v_current_cash < p_amount_kurus THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Kasada bu gider ödemesini karşılayacak kadar fiziki TL nakit bulunmamaktadır (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    IF v_category.is_salary_category = true THEN
        v_movement_type := 'salary_payment';
    END IF;

    -- 1. Gider Kaydı Oluştur
    INSERT INTO public.kasa_expenses (
        kasa_day_id, expense_category_id, sale_id, amount_kurus, description, recipient_name, created_by_user_id
    ) VALUES (
        p_kasa_day_id, p_expense_category_id, p_sale_id, p_amount_kurus, trim(p_description), p_recipient_name, p_actor_user_id
    ) RETURNING * INTO v_expense;

    -- 2. Kasa Hareket Kaydı
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, v_movement_type, p_sale_id, -p_amount_kurus, -p_amount_kurus, 0,
        'Gider (' || v_category.name || '): ' || trim(p_description), p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'gider_eklendi', 'kasa_expenses', v_expense.id, jsonb_build_object('category_name', v_category.name, 'amount_kurus', p_amount_kurus, 'recipient_name', p_recipient_name));

    RETURN to_jsonb(v_expense);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_create_expense(UUID, UUID, UUID, BIGINT, TEXT, TEXT, UUID) TO service_role;

-- 5. SECURE ATOMIC RPC: SATIŞ DÜZELTME (SADECE AÇIK GÜN, PERSONEL KENDİ SATIŞINI, YÖNETİCİ HERKESİN SATIŞINI)
DROP FUNCTION IF EXISTS public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT,
    TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
);

CREATE OR REPLACE FUNCTION public.fn_kasa_update_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_category_id UUID,
    p_product_name TEXT,
    p_quantity INT,
    p_unit_price_kurus BIGINT,
    p_cash_paid_kurus BIGINT,
    p_card_paid_kurus BIGINT,
    p_bank_transfer_paid_kurus BIGINT,
    p_bank_transfer_reference TEXT DEFAULT NULL,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC DEFAULT NULL,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC DEFAULT NULL,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_credit_paid_kurus BIGINT DEFAULT 0,
    p_credit_customer_id UUID DEFAULT NULL,
    p_justification TEXT DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_serial_imei TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_cost_price_kurus BIGINT DEFAULT NULL,
    p_service_cost_kurus BIGINT DEFAULT NULL
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
    v_category public.kasa_categories%ROWTYPE;
    v_updated_sale public.kasa_sales%ROWTYPE;
    v_total_price_kurus BIGINT;
    v_portions_sum BIGINT;
    v_total_cash_sales BIGINT := 0;
    v_total_cash_credit_payments BIGINT := 0;
    v_total_cash_expenses BIGINT := 0;
    v_total_bank_deposits BIGINT := 0;
    v_total_fx_conversions BIGINT := 0;
    v_current_cash BIGINT := 0;
    v_cash_diff BIGINT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Satış bulunamadı veya değiştirilebilir durumda değil (iptal/iade edilmiş).';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_sale.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kapanmış güne ait satışlar değiştirilemez.';
    END IF;

    -- ROL KONTROLÜ: Personel yalnızca kendi oluşturduğu satışı düzeltebilir!
    IF v_actor.role <> 'yonetici' AND v_sale.created_by_user_id <> p_actor_user_id THEN
        RAISE EXCEPTION 'YETKİSİZ: Personel yalnızca kendi oluşturduğu satışları düzeltebilir.';
    END IF;

    -- GÜVENLİK POLİTİKASI: CARİ VEYA DÖVİZ İÇEREN SATIŞLAR DOĞRUDAN DÜZELTİLEMEZ
    IF v_sale.credit_paid_kurus > 0 OR COALESCE(p_credit_paid_kurus, 0) > 0 OR
       v_sale.usd_paid_cents > 0 OR COALESCE(p_usd_paid_cents, 0) > 0 OR
       v_sale.eur_paid_cents > 0 OR COALESCE(p_eur_paid_cents, 0) > 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Cari/veresiye veya döviz içeren satışlar güvenlik nedeniyle doğrudan düzeltilemez. Yönetici tarafından iptal edilerek yeniden oluşturulmalıdır.';
    END IF;

    SELECT * INTO v_category FROM public.kasa_categories WHERE id = p_category_id;
    IF v_category.id IS NULL OR NOT v_category.is_active THEN
        RAISE EXCEPTION 'GEÇERSİZ_KATEGORİ: Seçilen satış kategorisi bulunamadı veya pasif.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Satış düzeltme gerekçesi zorunludur.';
    END IF;

    IF p_product_name IS NULL OR trim(p_product_name) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Ürün adı boş olamaz.';
    END IF;

    IF p_quantity <= 0 OR p_unit_price_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Miktar 1 veya üzeri, birim fiyat 0 veya üzeri olmalıdır.';
    END IF;

    -- MALİYET VE ÖDEME NEGATİF KONTROLLERİ
    IF COALESCE(p_cost_price_kurus, 0) < 0 OR COALESCE(p_service_cost_kurus, 0) < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Maliyet tutarları negatif olamaz.';
    END IF;

    IF COALESCE(p_cash_paid_kurus, 0) < 0 OR
       COALESCE(p_card_paid_kurus, 0) < 0 OR
       COALESCE(p_bank_transfer_paid_kurus, 0) < 0 OR
       COALESCE(p_credit_paid_kurus, 0) < 0 OR
       COALESCE(p_usd_paid_cents, 0) < 0 OR
       COALESCE(p_eur_paid_cents, 0) < 0 OR
       COALESCE(p_usd_tl_equivalent_kurus, 0) < 0 OR
       COALESCE(p_eur_tl_equivalent_kurus, 0) < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Ödeme tutarları negatif olamaz.';
    END IF;

    IF p_bank_transfer_reference IS NOT NULL AND length(p_bank_transfer_reference) > 200 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Havale / EFT referansı en fazla 200 karakter olabilir.';
    END IF;

    v_total_price_kurus := p_quantity * p_unit_price_kurus;
    v_portions_sum := COALESCE(p_cash_paid_kurus, 0) + COALESCE(p_card_paid_kurus, 0) + COALESCE(p_bank_transfer_paid_kurus, 0) + COALESCE(p_credit_paid_kurus, 0) + COALESCE(p_usd_tl_equivalent_kurus, 0) + COALESCE(p_eur_tl_equivalent_kurus, 0);

    IF v_total_price_kurus <> v_portions_sum THEN
        RAISE EXCEPTION 'GEÇERSİZ_ÖDEME: Satış toplam tutarı (% TL) ödeme yöntemlerinin toplamına (% TL) eşit olmalıdır.', (v_total_price_kurus / 100.0), (v_portions_sum / 100.0);
    END IF;

    -- FİZİKSEL NAKİT YETERSİZLİK KONTROLÜ (Düzeltme sonrası fiziki nakit eksiye düşmemeli)
    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_sales
    FROM public.kasa_sales WHERE kasa_day_id = v_sale.kasa_day_id AND status = 'completed';

    SELECT COALESCE(SUM(cash_paid_kurus), 0) INTO v_total_cash_credit_payments
    FROM public.kasa_credit_payments WHERE kasa_day_id = v_sale.kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_cash_expenses
    FROM public.kasa_expenses WHERE kasa_day_id = v_sale.kasa_day_id;

    SELECT COALESCE(SUM(amount_kurus), 0) INTO v_total_bank_deposits
    FROM public.kasa_bank_deposits WHERE kasa_day_id = v_sale.kasa_day_id;

    SELECT COALESCE(SUM(tl_equivalent_kurus), 0) INTO v_total_fx_conversions
    FROM public.kasa_fx_transactions WHERE kasa_day_id = v_sale.kasa_day_id AND transaction_type = 'fx_conversion_to_try';

    v_current_cash := v_day.opening_balance_kurus + v_day.capital_injected_kurus - v_day.owner_withdrawn_kurus + v_total_cash_sales + v_total_cash_credit_payments + v_total_fx_conversions - v_total_cash_expenses - v_total_bank_deposits;

    v_cash_diff := p_cash_paid_kurus - v_sale.cash_paid_kurus;
    IF (v_current_cash + v_cash_diff) < 0 THEN
        RAISE EXCEPTION 'YETERSİZ_NAKİT: Satış düzeltmesi sonrasında kasa fiziki nakit bakiyesi eksiye düşeceği için işlem reddedildi (Mevcut Nakit: % TL).', (v_current_cash / 100.0);
    END IF;

    -- TERS KAYIT: Eski satışın muhasebe etkisini hareket defterine geri yaz
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'satis_duzeltme_iptal', p_sale_id, -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus, -v_sale.bank_transfer_paid_kurus,
        'Satış Düzeltme İptali (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
    );

    -- YENİ KAYIT: Düzeltilmiş yeni satışın muhasebe etkisini hareket defterine ekle
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, sale_id, amount_kurus, cash_portion_kurus, card_portion_kurus, bank_transfer_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'satis_duzeltme_yeni', p_sale_id, v_total_price_kurus, p_cash_paid_kurus, p_card_paid_kurus, p_bank_transfer_paid_kurus,
        'Satış Düzeltme (' || v_sale.receipt_no || '): ' || trim(p_justification), p_actor_user_id
    );

    -- SATIŞ TABLOSUNU GÜNCELLE
    UPDATE public.kasa_sales SET
        category_id = p_category_id,
        product_name = trim(p_product_name),
        quantity = p_quantity,
        unit_price_kurus = p_unit_price_kurus,
        total_price_kurus = v_total_price_kurus,
        cash_paid_kurus = COALESCE(p_cash_paid_kurus, 0),
        card_paid_kurus = COALESCE(p_card_paid_kurus, 0),
        bank_transfer_paid_kurus = COALESCE(p_bank_transfer_paid_kurus, 0),
        bank_transfer_reference = p_bank_transfer_reference,
        usd_paid_cents = COALESCE(p_usd_paid_cents, 0),
        usd_rate = p_usd_rate,
        usd_tl_equivalent_kurus = COALESCE(p_usd_tl_equivalent_kurus, 0),
        eur_paid_cents = COALESCE(p_eur_paid_cents, 0),
        eur_rate = p_eur_rate,
        eur_tl_equivalent_kurus = COALESCE(p_eur_tl_equivalent_kurus, 0),
        credit_paid_kurus = COALESCE(p_credit_paid_kurus, 0),
        credit_customer_id = p_credit_customer_id,
        customer_name = p_customer_name,
        customer_phone = p_customer_phone,
        serial_imei = p_serial_imei,
        description = p_description,
        cost_price_kurus = p_cost_price_kurus,
        service_cost_kurus = p_service_cost_kurus
    WHERE id = p_sale_id
    RETURNING * INTO v_updated_sale;

    -- AUDIT LOG KAYDI
    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'satis_duzeltildi', 'kasa_sales', p_sale_id, jsonb_build_object(
        'receipt_no', v_sale.receipt_no,
        'justification', trim(p_justification),
        'old_total_kurus', v_sale.total_price_kurus,
        'new_total_kurus', v_total_price_kurus,
        'old_cash_kurus', v_sale.cash_paid_kurus,
        'new_cash_kurus', p_cash_paid_kurus,
        'old_card_kurus', v_sale.card_paid_kurus,
        'new_card_kurus', p_card_paid_kurus,
        'old_bank_transfer_kurus', v_sale.bank_transfer_paid_kurus,
        'new_bank_transfer_kurus', p_bank_transfer_paid_kurus
    ));

    RETURN to_jsonb(v_updated_sale);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT,
    TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_kasa_update_sale(
    UUID, UUID, UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT,
    BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, UUID, TEXT,
    TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
) TO service_role;

COMMIT;
