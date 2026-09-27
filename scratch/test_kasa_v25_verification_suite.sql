-- ============================================================================
-- HURCELL KASA V25 CANLI VERİTABANI YETKİ VE GÜVENLİK TEST SÜİTİ
-- ============================================================================

CREATE TEMP TABLE IF NOT EXISTS temp_v25_results (
    test_id INTEGER,
    test_name TEXT,
    status TEXT,
    message TEXT
);
TRUNCATE temp_v25_results;

DO $$
DECLARE
    v_hur public.kasa_users%ROWTYPE;
    v_bahar public.kasa_users%ROWTYPE;
    v_koray public.kasa_users%ROWTYPE;
    
    v_sample_day public.kasa_days%ROWTYPE;
    v_closed_day public.kasa_days%ROWTYPE;
    v_cash_cat public.kasa_expense_categories%ROWTYPE;
    v_salary_cat public.kasa_expense_categories%ROWTYPE;
    v_bank_acc public.kasa_bank_accounts%ROWTYPE;
    v_sample_sale public.kasa_sales%ROWTYPE;

    v_koray_perms TEXT[];
    v_bahar_perms TEXT[];
BEGIN
    SELECT * INTO v_hur FROM public.kasa_users WHERE username = 'hur';
    SELECT * INTO v_bahar FROM public.kasa_users WHERE username = 'bahar';
    SELECT * INTO v_koray FROM public.kasa_users WHERE username = 'koray';

    SELECT * INTO v_sample_day FROM public.kasa_days ORDER BY date_val DESC LIMIT 1;
    SELECT * INTO v_closed_day FROM public.kasa_days WHERE status = 'closed' ORDER BY date_val DESC LIMIT 1;
    SELECT * INTO v_cash_cat FROM public.kasa_expense_categories WHERE is_salary_category = false AND is_active = true LIMIT 1;
    SELECT * INTO v_salary_cat FROM public.kasa_expense_categories WHERE is_salary_category = true AND is_active = true LIMIT 1;
    SELECT * INTO v_bank_acc FROM public.kasa_bank_accounts WHERE is_active = true LIMIT 1;
    SELECT * INTO v_sample_sale FROM public.kasa_sales WHERE status = 'completed' LIMIT 1;

    -- TEST 1: Koray İzin Kümesi
    SELECT array_agg(permission_key ORDER BY permission_key) INTO v_koray_perms
    FROM public.kasa_user_permissions
    WHERE user_id = v_koray.id AND is_allowed IS TRUE AND revoked_at IS NULL;

    IF v_koray_perms = ARRAY['kasa.expense.view_all'] THEN
        INSERT INTO temp_v25_results VALUES (1, 'Koray Sadece kasa.expense.view_all İznine Sahip', 'PASS', array_to_string(v_koray_perms, ', '));
    ELSE
        INSERT INTO temp_v25_results VALUES (1, 'Koray Sadece kasa.expense.view_all İznine Sahip', 'FAIL', array_to_string(v_koray_perms, ', '));
    END IF;

    -- TEST 2: Bahar İzin Kümesi
    SELECT array_agg(permission_key ORDER BY permission_key) INTO v_bahar_perms
    FROM public.kasa_user_permissions
    WHERE user_id = v_bahar.id AND is_allowed IS TRUE AND revoked_at IS NULL;

    IF 'kasa.expense.create' = ANY(v_bahar_perms) 
       AND 'kasa.sale.update' = ANY(v_bahar_perms)
       AND 'kasa.sale.cancel' = ANY(v_bahar_perms)
       AND 'kasa.expense.bank' = ANY(v_bahar_perms)
       AND 'kasa.expense.salary.create' = ANY(v_bahar_perms)
       AND 'kasa.expense.view_all' = ANY(v_bahar_perms)
       AND 'kasa.bank.balance.record' = ANY(v_bahar_perms) THEN
        INSERT INTO temp_v25_results VALUES (2, 'Bahar Tüm Operasyonel İzinlere Sahip', 'PASS', array_to_string(v_bahar_perms, ', '));
    ELSE
        INSERT INTO temp_v25_results VALUES (2, 'Bahar Tüm Operasyonel İzinlere Sahip', 'FAIL', array_to_string(v_bahar_perms, ', '));
    END IF;

    -- TEST 3: Koray Nakit Gider Ekleyemez
    IF v_sample_day.id IS NOT NULL AND v_cash_cat.id IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_kasa_create_expense(
                v_koray.id, v_sample_day.id, v_cash_cat.id, 100, 'Koray Nakit Test', NULL, NULL, 'cash', NULL, NULL
            );
            INSERT INTO temp_v25_results VALUES (3, 'Koray Nakit Gider Ekleyemez (fn_kasa_create_expense)', 'FAIL', 'Hata fırlatılmadı, işlem kabul edildi!');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%YETKISIZ%' OR SQLERRM LIKE '%YETKİSİZ%' THEN
                INSERT INTO temp_v25_results VALUES (3, 'Koray Nakit Gider Ekleyemez (fn_kasa_create_expense)', 'PASS', 'Doğru YETKİSİZ engeli fırlatıldı: ' || SQLERRM);
            ELSE
                INSERT INTO temp_v25_results VALUES (3, 'Koray Nakit Gider Ekleyemez (fn_kasa_create_expense)', 'FAIL', 'Beklenmeyen hata: ' || SQLERRM);
            END IF;
        END;
    ELSE
        INSERT INTO temp_v25_results VALUES (3, 'Koray Nakit Gider Ekleyemez (fn_kasa_create_expense)', 'SKIP', 'Gün veya kategori bulunamadı');
    END IF;

    -- TEST 4: Koray Banka Gideri Ekleyemez
    IF v_sample_day.id IS NOT NULL AND v_cash_cat.id IS NOT NULL AND v_bank_acc.id IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_kasa_create_expense(
                v_koray.id, v_sample_day.id, v_cash_cat.id, 100, 'Koray Banka Test', NULL, NULL, 'bank', v_bank_acc.id, NULL
            );
            INSERT INTO temp_v25_results VALUES (4, 'Koray Banka Gideri Ekleyemez (fn_kasa_create_expense)', 'FAIL', 'Hata fırlatılmadı, işlem kabul edildi!');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%YETKISIZ%' OR SQLERRM LIKE '%YETKİSİZ%' THEN
                INSERT INTO temp_v25_results VALUES (4, 'Koray Banka Gideri Ekleyemez (fn_kasa_create_expense)', 'PASS', 'Doğru YETKİSİZ engeli fırlatıldı: ' || SQLERRM);
            ELSE
                INSERT INTO temp_v25_results VALUES (4, 'Koray Banka Gideri Ekleyemez (fn_kasa_create_expense)', 'FAIL', 'Beklenmeyen hata: ' || SQLERRM);
            END IF;
        END;
    ELSE
        INSERT INTO temp_v25_results VALUES (4, 'Koray Banka Gideri Ekleyemez (fn_kasa_create_expense)', 'SKIP', 'Gün veya banka hesabı bulunamadı');
    END IF;

    -- TEST 5: Koray Maaş Gideri Ekleyemez
    IF v_sample_day.id IS NOT NULL AND v_salary_cat.id IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_kasa_create_expense(
                v_koray.id, v_sample_day.id, v_salary_cat.id, 100, 'Koray Maaş Test', 'Test Personel', NULL, 'cash', NULL, NULL
            );
            INSERT INTO temp_v25_results VALUES (5, 'Koray Maaş Gideri Ekleyemez (fn_kasa_create_expense)', 'FAIL', 'Hata fırlatılmadı, işlem kabul edildi!');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%YETKISIZ%' OR SQLERRM LIKE '%YETKİSİZ%' THEN
                INSERT INTO temp_v25_results VALUES (5, 'Koray Maaş Gideri Ekleyemez (fn_kasa_create_expense)', 'PASS', 'Doğru YETKİSİZ engeli fırlatıldı: ' || SQLERRM);
            ELSE
                INSERT INTO temp_v25_results VALUES (5, 'Koray Maaş Gideri Ekleyemez (fn_kasa_create_expense)', 'FAIL', 'Beklenmeyen hata: ' || SQLERRM);
            END IF;
        END;
    ELSE
        INSERT INTO temp_v25_results VALUES (5, 'Koray Maaş Gideri Ekleyemez (fn_kasa_create_expense)', 'SKIP', 'Gün veya maaş kategorisi bulunamadı');
    END IF;

    -- TEST 6: Koray Satış Düzenleyemez
    IF v_sample_sale.id IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_kasa_update_sale(
                v_koray.id, v_sample_sale.id, v_sample_sale.category_id, v_sample_sale.product_name,
                v_sample_sale.quantity, v_sample_sale.unit_price_kurus, v_sample_sale.total_price_kurus,
                NULL, NULL, 0, 0, 0, NULL, 0, NULL, 0, 0, NULL, 0, NULL, 0, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                'Koray Yetkisiz Düzeltme Denemesi', NULL
            );
            INSERT INTO temp_v25_results VALUES (6, 'Koray Satış Düzenleyemez (fn_kasa_update_sale)', 'FAIL', 'Hata fırlatılmadı, işlem kabul edildi!');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%YETKISIZ%' OR SQLERRM LIKE '%YETKİSİZ%' THEN
                INSERT INTO temp_v25_results VALUES (6, 'Koray Satış Düzenleyemez (fn_kasa_update_sale)', 'PASS', 'Doğru YETKİSİZ engeli fırlatıldı: ' || SQLERRM);
            ELSE
                INSERT INTO temp_v25_results VALUES (6, 'Koray Satış Düzenleyemez (fn_kasa_update_sale)', 'FAIL', 'Beklenmeyen hata: ' || SQLERRM);
            END IF;
        END;
    ELSE
        INSERT INTO temp_v25_results VALUES (6, 'Koray Satış Düzenleyemez (fn_kasa_update_sale)', 'SKIP', 'Örnek satış bulunamadı');
    END IF;

    -- TEST 7: Koray Satış İptal Edemez
    IF v_sample_sale.id IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_kasa_cancel_sale(
                v_koray.id, v_sample_sale.id, 'Koray Yetkisiz İptal Denemesi', true, NULL
            );
            INSERT INTO temp_v25_results VALUES (7, 'Koray Satış İptal Edemez (fn_kasa_cancel_sale)', 'FAIL', 'Hata fırlatılmadı, işlem kabul edildi!');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%YETKISIZ%' OR SQLERRM LIKE '%YETKİSİZ%' THEN
                INSERT INTO temp_v25_results VALUES (7, 'Koray Satış İptal Edemez (fn_kasa_cancel_sale)', 'PASS', 'Doğru YETKİSİZ engeli fırlatıldı: ' || SQLERRM);
            ELSE
                INSERT INTO temp_v25_results VALUES (7, 'Koray Satış İptal Edemez (fn_kasa_cancel_sale)', 'FAIL', 'Beklenmeyen hata: ' || SQLERRM);
            END IF;
        END;
    ELSE
        INSERT INTO temp_v25_results VALUES (7, 'Koray Satış İptal Edemez (fn_kasa_cancel_sale)', 'SKIP', 'Örnek satış bulunamadı');
    END IF;

    -- TEST 8: Koray Günlük Banka Bakiyesi Giremez
    IF v_bank_acc.id IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_kasa_record_bank_daily_balance(
                v_koray.id, v_bank_acc.id, CURRENT_DATE, 100000, 'Koray Yetkisiz Mutabakat'
            );
            INSERT INTO temp_v25_results VALUES (8, 'Koray Banka Bakiyesi Giremez (fn_kasa_record_bank_daily_balance)', 'FAIL', 'Hata fırlatılmadı, işlem kabul edildi!');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%YETKISIZ%' OR SQLERRM LIKE '%YETKİSİZ%' THEN
                INSERT INTO temp_v25_results VALUES (8, 'Koray Banka Bakiyesi Giremez (fn_kasa_record_bank_daily_balance)', 'PASS', 'Doğru YETKİSİZ engeli fırlatıldı: ' || SQLERRM);
            ELSE
                INSERT INTO temp_v25_results VALUES (8, 'Koray Banka Bakiyesi Giremez (fn_kasa_record_bank_daily_balance)', 'FAIL', 'Beklenmeyen hata: ' || SQLERRM);
            END IF;
        END;
    ELSE
        INSERT INTO temp_v25_results VALUES (8, 'Koray Banka Bakiyesi Giremez (fn_kasa_record_bank_daily_balance)', 'SKIP', 'Banka hesabı bulunamadı');
    END IF;

    -- TEST 9: Koray Kapalı Günü Yeniden Açamaz
    IF v_closed_day.id IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_kasa_reopen_day(
                v_koray.id, v_closed_day.id, 'Koray Yetkisiz Yeniden Açma Denemesi'
            );
            INSERT INTO temp_v25_results VALUES (9, 'Koray Kapalı Günü Yeniden Açamaz (fn_kasa_reopen_day)', 'FAIL', 'Hata fırlatılmadı, işlem kabul edildi!');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%YETKISIZ%' OR SQLERRM LIKE '%YETKİSİZ%' THEN
                INSERT INTO temp_v25_results VALUES (9, 'Koray Kapalı Günü Yeniden Açamaz (fn_kasa_reopen_day)', 'PASS', 'Doğru YETKİSİZ engeli fırlatıldı: ' || SQLERRM);
            ELSE
                INSERT INTO temp_v25_results VALUES (9, 'Koray Kapalı Günü Yeniden Açamaz (fn_kasa_reopen_day)', 'FAIL', 'Beklenmeyen hata: ' || SQLERRM);
            END IF;
        END;
    ELSE
        INSERT INTO temp_v25_results VALUES (9, 'Koray Kapalı Günü Yeniden Açamaz (fn_kasa_reopen_day)', 'SKIP', 'Kapalı gün bulunamadı');
    END IF;
END $$;

SELECT jsonb_pretty(jsonb_agg(to_jsonb(r))) AS all_test_results
FROM (SELECT * FROM temp_v25_results ORDER BY test_id) r;
