-- Migration: 20260828190000_kasa_required_expense_categories.sql
-- Description: Idempotent migration matching production daily expense categories update.

BEGIN;

DO $$
BEGIN
    -- 1. Rename existing "Teknik Servis Gideri" to "Teknik Servis" if present, or ensure "Teknik Servis" is active
    IF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = 'e1b6be83-046d-4172-9925-da501cec49dc') THEN
        UPDATE public.kasa_expense_categories
        SET name = 'Teknik Servis', is_active = true, display_order = 2
        WHERE id = 'e1b6be83-046d-4172-9925-da501cec49dc';
    ELSIF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE lower(trim(name)) IN ('teknik servis', 'teknik servis gideri')) THEN
        UPDATE public.kasa_expense_categories
        SET name = 'Teknik Servis', is_active = true, display_order = 2
        WHERE lower(trim(name)) IN ('teknik servis', 'teknik servis gideri');
    ELSE
        INSERT INTO public.kasa_expense_categories (id, name, display_order, is_salary_category, is_active)
        VALUES ('e1b6be83-046d-4172-9925-da501cec49dc', 'Teknik Servis', 2, false, true);
    END IF;

    -- 2. Rename existing "Yemek / İkram" to "Yemek" if present, or ensure "Yemek" is active
    IF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = '806bc7c7-ee55-4063-86cb-980ee85c9a6b') THEN
        UPDATE public.kasa_expense_categories
        SET name = 'Yemek', is_active = true, display_order = 3
        WHERE id = '806bc7c7-ee55-4063-86cb-980ee85c9a6b';
    ELSIF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE lower(trim(name)) IN ('yemek', 'yemek / ikram')) THEN
        UPDATE public.kasa_expense_categories
        SET name = 'Yemek', is_active = true, display_order = 3
        WHERE lower(trim(name)) IN ('yemek', 'yemek / ikram');
    ELSE
        INSERT INTO public.kasa_expense_categories (id, name, display_order, is_salary_category, is_active)
        VALUES ('806bc7c7-ee55-4063-86cb-980ee85c9a6b', 'Yemek', 3, false, true);
    END IF;

    -- 3. Ensure "Kırtasiye" exists and is active
    IF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = '726de844-7f8e-4776-bbcb-72a892084ceb') THEN
        UPDATE public.kasa_expense_categories
        SET name = 'Kırtasiye', is_active = true, display_order = 4
        WHERE id = '726de844-7f8e-4776-bbcb-72a892084ceb';
    ELSIF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE lower(trim(name)) = 'kırtasiye') THEN
        UPDATE public.kasa_expense_categories
        SET is_active = true, display_order = 4
        WHERE lower(trim(name)) = 'kırtasiye';
    ELSE
        INSERT INTO public.kasa_expense_categories (id, name, display_order, is_salary_category, is_active)
        VALUES ('726de844-7f8e-4776-bbcb-72a892084ceb', 'Kırtasiye', 4, false, true);
    END IF;

    -- 4. Ensure "Malzeme" exists and is active
    IF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = '9fec4ba1-7e8f-43ec-9757-6b2b4248e7ee') THEN
        UPDATE public.kasa_expense_categories
        SET name = 'Malzeme', is_active = true, display_order = 5
        WHERE id = '9fec4ba1-7e8f-43ec-9757-6b2b4248e7ee';
    ELSIF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE lower(trim(name)) = 'malzeme') THEN
        UPDATE public.kasa_expense_categories
        SET is_active = true, display_order = 5
        WHERE lower(trim(name)) = 'malzeme';
    ELSE
        INSERT INTO public.kasa_expense_categories (id, name, display_order, is_salary_category, is_active)
        VALUES ('9fec4ba1-7e8f-43ec-9757-6b2b4248e7ee', 'Malzeme', 5, false, true);
    END IF;

    -- 5. Ensure "Diğer" exists and is active with UUID 5b12cf31-6194-4990-9408-6be7933d3529
    IF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE id = '5b12cf31-6194-4990-9408-6be7933d3529') THEN
        UPDATE public.kasa_expense_categories
        SET name = 'Diğer', is_active = true, display_order = 6
        WHERE id = '5b12cf31-6194-4990-9408-6be7933d3529';
    ELSIF EXISTS (SELECT 1 FROM public.kasa_expense_categories WHERE lower(trim(name)) = 'diğer') THEN
        UPDATE public.kasa_expense_categories
        SET is_active = true, display_order = 6
        WHERE lower(trim(name)) = 'diğer';
    ELSE
        INSERT INTO public.kasa_expense_categories (id, name, display_order, is_salary_category, is_active)
        VALUES ('5b12cf31-6194-4990-9408-6be7933d3529', 'Diğer', 6, false, true);
    END IF;
END $$;

COMMIT;
