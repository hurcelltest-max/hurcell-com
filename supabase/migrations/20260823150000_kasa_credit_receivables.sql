-- Migration: 20260823150000_kasa_credit_receivables.sql
-- Description: HurCELL Kasa Föyü Cari / Veresiye Satış, Tahsilat Altyapısı, Eski Borç Uyumlu (Option A) FIFO Dağıtımı ve 7 Günlük Gecikme Takibi

BEGIN;

-- 1. KASA SALES TABLOSUNA CARİ ALANLARIN EKLENMESİ
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS credit_customer_id UUID REFERENCES public.credit_customers(id);
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS credit_account_id UUID REFERENCES public.credit_accounts(id);
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS credit_paid_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_credit_paid CHECK (credit_paid_kurus >= 0);
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS uncollected_credit_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_uncollected_credit CHECK (uncollected_credit_kurus >= 0);
ALTER TABLE public.kasa_sales ADD COLUMN IF NOT EXISTS uncollected_cost_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_sales_uncollected_cost CHECK (uncollected_cost_kurus >= 0);

-- Eski ödeme kısıtlamasını kaldırıp cari ödemeyi dâhil eden yeni kısıtlama eklenmesi
ALTER TABLE public.kasa_sales DROP CONSTRAINT IF EXISTS chk_kasa_sales_payment_math;
ALTER TABLE public.kasa_sales ADD CONSTRAINT chk_kasa_sales_payment_math CHECK (
    total_price_kurus = (cash_paid_kurus + card_paid_kurus + usd_tl_equivalent_kurus + eur_tl_equivalent_kurus + credit_paid_kurus)
);

CREATE INDEX IF NOT EXISTS idx_kasa_sales_credit_customer ON public.kasa_sales(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_kasa_sales_uncollected_credit ON public.kasa_sales(uncollected_credit_kurus) WHERE uncollected_credit_kurus > 0;

-- 2. KASA DAYS TABLOSUNA GECİKME EŞİĞİ EKLENMESİ
ALTER TABLE public.kasa_days ADD COLUMN IF NOT EXISTS overdue_days_threshold INT NOT NULL DEFAULT 7;

-- 3. KASA CARİ TAHSİLAT TABLOSU
CREATE TABLE IF NOT EXISTS public.kasa_credit_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kasa_day_id UUID NOT NULL REFERENCES public.kasa_days(id),
    credit_customer_id UUID NOT NULL REFERENCES public.credit_customers(id),
    credit_account_id UUID NOT NULL REFERENCES public.credit_accounts(id),
    amount_kurus BIGINT NOT NULL CONSTRAINT chk_kasa_credit_payments_amount CHECK (amount_kurus > 0),
    payment_method TEXT NOT NULL CONSTRAINT chk_kasa_credit_payments_method CHECK (payment_method IN ('cash', 'card', 'usd', 'eur')),
    cash_paid_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_credit_payments_cash CHECK (cash_paid_kurus >= 0),
    card_paid_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_credit_payments_card CHECK (card_paid_kurus >= 0),
    usd_paid_cents BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_credit_payments_usd CHECK (usd_paid_cents >= 0),
    usd_rate NUMERIC(12, 4),
    usd_tl_equivalent_kurus BIGINT NOT NULL DEFAULT 0,
    eur_paid_cents BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_credit_payments_eur CHECK (eur_paid_cents >= 0),
    eur_rate NUMERIC(12, 4),
    eur_tl_equivalent_kurus BIGINT NOT NULL DEFAULT 0,
    description TEXT,
    created_by_user_id UUID NOT NULL REFERENCES public.kasa_users(id),
    idempotency_key TEXT CONSTRAINT uq_kasa_credit_payments_idempotency UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kasa_credit_payments_day ON public.kasa_credit_payments(kasa_day_id);
CREATE INDEX IF NOT EXISTS idx_kasa_credit_payments_customer ON public.kasa_credit_payments(credit_customer_id);

-- 4. TAHSİLAT FIFO TAHSİS TABLOSU (Payment Allocation - Legacy Borçlar İçin sale_id NULL Olabilir)
CREATE TABLE IF NOT EXISTS public.kasa_credit_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_payment_id UUID NOT NULL REFERENCES public.kasa_credit_payments(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.kasa_sales(id),
    allocated_amount_kurus BIGINT NOT NULL CONSTRAINT chk_kasa_allocations_amount CHECK (allocated_amount_kurus > 0),
    allocated_cost_kurus BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_kasa_allocations_cost CHECK (allocated_cost_kurus >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kasa_allocations_payment ON public.kasa_credit_payment_allocations(credit_payment_id);
CREATE INDEX IF NOT EXISTS idx_kasa_allocations_sale ON public.kasa_credit_payment_allocations(sale_id);

-- RLS POLİTİKALARI
ALTER TABLE public.kasa_credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_credit_payment_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kasa_credit_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.kasa_credit_payment_allocations FROM PUBLIC, anon, authenticated;

-- 5. SECURE SECURITY DEFINER RPC: CARİ TAHSİLAT ALMA, ESKİ BORÇ (OPTION A) VE FIFO DAĞITIMI
CREATE OR REPLACE FUNCTION public.fn_kasa_collect_credit_payment(
    p_actor_user_id UUID,
    p_kasa_day_id UUID,
    p_credit_customer_id UUID,
    p_amount_kurus BIGINT,
    p_payment_method TEXT,
    p_cash_paid_kurus BIGINT DEFAULT 0,
    p_card_paid_kurus BIGINT DEFAULT 0,
    p_usd_paid_cents BIGINT DEFAULT 0,
    p_usd_rate NUMERIC(12, 4) DEFAULT NULL,
    p_usd_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_eur_paid_cents BIGINT DEFAULT 0,
    p_eur_rate NUMERIC(12, 4) DEFAULT NULL,
    p_eur_tl_equivalent_kurus BIGINT DEFAULT 0,
    p_description TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_day public.kasa_days%ROWTYPE;
    v_customer public.credit_customers%ROWTYPE;
    v_account public.credit_accounts%ROWTYPE;
    v_existing public.kasa_credit_payments%ROWTYPE;
    v_payment public.kasa_credit_payments%ROWTYPE;
    v_kasa_open_credit_total BIGINT;
    v_legacy_credit_kurus BIGINT;
    v_legacy_alloc BIGINT;
    v_remaining_payment BIGINT;
    v_sale_rec RECORD;
    v_allocate_amt BIGINT;
    v_allocate_cost BIGINT;
    v_trans_code TEXT;
    v_new_balance NUMERIC;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Aktif kullanıcı bulunamadı.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = p_kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Kasa günü bulunamadı veya kapalı.';
    END IF;

    SELECT * INTO v_customer FROM public.credit_customers WHERE id = p_credit_customer_id;
    IF v_customer.id IS NULL OR v_customer.status <> 'active' THEN
        RAISE EXCEPTION 'GEÇERSİZ_MÜŞTERİ: Cari müşteri bulunamadı veya hesabı aktif değil.';
    END IF;

    SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = p_credit_customer_id FOR UPDATE;
    IF v_account.id IS NULL OR v_account.status <> 'active' THEN
        RAISE EXCEPTION 'GEÇERSİZ_HESAP: Müşterinin aktif cari hesabı bulunmamaktadır.';
    END IF;

    IF p_amount_kurus <= 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Tahsilat tutarı 0 veya negatif olamaz.';
    END IF;

    -- Müşterinin toplam cari borcunu aşan tahsilat engellenir
    IF (p_amount_kurus / 100.0) > (v_account.current_balance + 0.01) THEN
        RAISE EXCEPTION 'LİMİT_AŞIMI: Tahsilat tutarı müşterinin mevcut açık cari borcundan (%) büyüktür.', v_account.current_balance;
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        SELECT * INTO v_existing FROM public.kasa_credit_payments WHERE idempotency_key = p_idempotency_key;
        IF v_existing.id IS NOT NULL THEN
            RETURN to_jsonb(v_existing);
        END IF;
    END IF;

    -- 1. Tahsilat Kaydını Oluştur
    INSERT INTO public.kasa_credit_payments (
        kasa_day_id, credit_customer_id, credit_account_id, amount_kurus, payment_method,
        cash_paid_kurus, card_paid_kurus, usd_paid_cents, usd_rate, usd_tl_equivalent_kurus,
        eur_paid_cents, eur_rate, eur_tl_equivalent_kurus, description, created_by_user_id, idempotency_key
    ) VALUES (
        p_kasa_day_id, p_credit_customer_id, v_account.id, p_amount_kurus, p_payment_method,
        p_cash_paid_kurus, p_card_paid_kurus, p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus,
        p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus, COALESCE(p_description, 'Cari Borç Tahsilatı'), p_actor_user_id, p_idempotency_key
    ) RETURNING * INTO v_payment;

    -- 2. Kasa Hareket Kaydı
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        p_kasa_day_id, 'nakit_tahsilat', p_amount_kurus, p_cash_paid_kurus, p_card_paid_kurus,
        'Cari Tahsilat: ' || v_customer.full_name || ' (' || UPPER(p_payment_method) || ')', p_actor_user_id
    );

    -- 3. Dövizle Tahsilat Yapılmışsa Döviz Kasasını Güncelle
    IF p_usd_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            usd_balance_cents = usd_balance_cents + p_usd_paid_cents,
            usd_cost_pool_kurus = usd_cost_pool_kurus + p_usd_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'USD', p_usd_paid_cents, p_usd_rate, p_usd_tl_equivalent_kurus,
            'Cari Tahsilat (USD): ' || v_customer.full_name, p_actor_user_id
        );
    END IF;

    IF p_eur_paid_cents > 0 THEN
        UPDATE public.kasa_days SET
            eur_balance_cents = eur_balance_cents + p_eur_paid_cents,
            eur_cost_pool_kurus = eur_cost_pool_kurus + p_eur_tl_equivalent_kurus
        WHERE id = p_kasa_day_id;

        INSERT INTO public.kasa_fx_transactions (
            kasa_day_id, transaction_type, currency_code, foreign_amount_cents, exchange_rate, tl_equivalent_kurus, description, created_by_user_id
        ) VALUES (
            p_kasa_day_id, 'fx_sale_payment', 'EUR', p_eur_paid_cents, p_eur_rate, p_eur_tl_equivalent_kurus,
            'Cari Tahsilat (EUR): ' || v_customer.full_name, p_actor_user_id
        );
    END IF;

    -- 4. OPTSİYON A: ESKİ MİRAS BORÇLAR İLE YENİ KASA SATIŞLARININ ŞEFFAF TAHSİS DAĞITIMI
    v_remaining_payment := p_amount_kurus;

    -- Kasa Öncesi Eski Borç Miktarını Tespit Et
    SELECT COALESCE(SUM(uncollected_credit_kurus), 0) INTO v_kasa_open_credit_total
    FROM public.kasa_sales
    WHERE credit_customer_id = p_credit_customer_id AND status = 'completed' AND uncollected_credit_kurus > 0;

    v_legacy_credit_kurus := GREATEST(ROUND(v_account.current_balance * 100) - v_kasa_open_credit_total, 0);

    -- Önce Eski Cari Borca Tahsis Yap (Eski Borç Varsa)
    IF v_legacy_credit_kurus > 0 THEN
        v_legacy_alloc := LEAST(v_remaining_payment, v_legacy_credit_kurus);

        INSERT INTO public.kasa_credit_payment_allocations (
            credit_payment_id, sale_id, allocated_amount_kurus, allocated_cost_kurus
        ) VALUES (
            v_payment.id, NULL, v_legacy_alloc, 0
        );

        v_remaining_payment := v_remaining_payment - v_legacy_alloc;
    END IF;

    -- Kalan Tahsilatı Kasa Satışlarına FIFO Sırasıyla Dağıt
    IF v_remaining_payment > 0 THEN
        FOR v_sale_rec IN
            SELECT id, uncollected_credit_kurus, uncollected_cost_kurus, credit_paid_kurus, cost_price_kurus, quantity
            FROM public.kasa_sales
            WHERE credit_customer_id = p_credit_customer_id AND status = 'completed' AND uncollected_credit_kurus > 0
            ORDER BY created_at ASC, id ASC
        LOOP
            EXIT WHEN v_remaining_payment <= 0;

            IF v_remaining_payment >= v_sale_rec.uncollected_credit_kurus THEN
                v_allocate_amt := v_sale_rec.uncollected_credit_kurus;
                v_allocate_cost := v_sale_rec.uncollected_cost_kurus;
            ELSE
                v_allocate_amt := v_remaining_payment;
                IF v_sale_rec.credit_paid_kurus > 0 THEN
                    v_allocate_cost := ROUND((v_allocate_amt::NUMERIC / v_sale_rec.credit_paid_kurus::NUMERIC) * COALESCE(v_sale_rec.cost_price_kurus * v_sale_rec.quantity, 0));
                ELSE
                    v_allocate_cost := 0;
                END IF;
            END IF;

            UPDATE public.kasa_sales SET
                uncollected_credit_kurus = uncollected_credit_kurus - v_allocate_amt,
                uncollected_cost_kurus = GREATEST(uncollected_cost_kurus - v_allocate_cost, 0)
            WHERE id = v_sale_rec.id;

            INSERT INTO public.kasa_credit_payment_allocations (
                credit_payment_id, sale_id, allocated_amount_kurus, allocated_cost_kurus
            ) VALUES (
                v_payment.id, v_sale_rec.id, v_allocate_amt, v_allocate_cost
            );

            v_remaining_payment := v_remaining_payment - v_allocate_amt;
        END LOOP;
    END IF;

    -- 5. Müşterinin Cari Hesabını Güncelle ve Credit Ledger'a Yaz
    v_new_balance := GREATEST(v_account.current_balance - (p_amount_kurus / 100.0), 0);
    UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = v_account.id;

    v_trans_code := 'PAY-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

    INSERT INTO public.credit_transactions (
        transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
        amount, description, source_type, source_reference, payment_method, admin_username, balance_after
    ) VALUES (
        v_trans_code, p_credit_customer_id, v_account.id, 'payment', 'credit',
        (p_amount_kurus / 100.0), COALESCE(p_description, 'Kasa İçi Cari Tahsilat'), 'store_sale', v_payment.id::text,
        CASE WHEN p_payment_method = 'cash' THEN 'cash' WHEN p_payment_method = 'card' THEN 'card' ELSE 'other' END,
        v_actor.username, v_new_balance
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'cari_tahsilat_alindi', 'kasa_credit_payments', v_payment.id, jsonb_build_object('customer_id', p_credit_customer_id, 'amount_kurus', p_amount_kurus, 'new_balance', v_new_balance));

    RETURN to_jsonb(v_payment);
END;
$$;

-- REVOKE ALL FROM PUBLIC FOR NEW RPC
REVOKE ALL ON FUNCTION public.fn_kasa_collect_credit_payment(UUID, UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, NUMERIC, BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- CARİ SATIŞ İPTALİNİ GÜVENLE YÖNETEN GÜNCELLENMİŞ FN_KASA_CANCEL_SALE
CREATE OR REPLACE FUNCTION public.fn_kasa_cancel_sale(
    p_actor_user_id UUID,
    p_sale_id UUID,
    p_justification TEXT
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
    v_account public.credit_accounts%ROWTYPE;
    v_uncollected_credit BIGINT;
    v_new_balance NUMERIC;
    v_trans_code TEXT;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.role <> 'yonetici' OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Yalnızca yöneticiler satış iptali yapabilir.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: İptal gerekçesi girmek zorunludur.';
    END IF;

    SELECT * INTO v_sale FROM public.kasa_sales WHERE id = p_sale_id FOR UPDATE;
    IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: İptal edilecek tamamlanmış satış bulunamadı.';
    END IF;

    SELECT * INTO v_day FROM public.kasa_days WHERE id = v_sale.kasa_day_id FOR UPDATE;
    IF v_day.id IS NULL OR v_day.status <> 'open' THEN
        RAISE EXCEPTION 'GEÇERSİZ_İŞLEM: Satışın ait olduğu kasa günü açık değil.';
    END IF;

    -- EĞER CARİ VERESİYE SATIŞ İSE MÜŞTERİNİN AÇIK BORCUNU DÜŞ
    IF v_sale.credit_customer_id IS NOT NULL AND v_sale.uncollected_credit_kurus > 0 THEN
        SELECT * INTO v_account FROM public.credit_accounts WHERE credit_customer_id = v_sale.credit_customer_id FOR UPDATE;
        IF v_account.id IS NOT NULL THEN
            v_uncollected_credit := v_sale.uncollected_credit_kurus;
            v_new_balance := GREATEST(v_account.current_balance - (v_uncollected_credit / 100.0), 0);

            UPDATE public.credit_accounts SET current_balance = v_new_balance, updated_at = now() WHERE id = v_account.id;

            v_trans_code := 'REV-KASA-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.credit_transaction_code_seq')::text, 6, '0');

            INSERT INTO public.credit_transactions (
                transaction_code, credit_customer_id, credit_account_id, transaction_type, direction,
                amount, description, source_type, source_reference, admin_username, balance_after
            ) VALUES (
                v_trans_code, v_sale.credit_customer_id, v_account.id, 'reversal', 'credit',
                (v_uncollected_credit / 100.0), 'Kasa Satış İptali: ' || v_sale.receipt_no || ' (Gerekçe: ' || p_justification || ')',
                'store_sale', v_sale.id::text, v_actor.username, v_new_balance
            );
        END IF;
    END IF;

    -- Satış Durumunu 'cancelled' Yap
    UPDATE public.kasa_sales SET
        status = 'cancelled',
        description = COALESCE(description, '') || ' [İPTAL GEREKÇESİ: ' || p_justification || ']',
        uncollected_credit_kurus = 0,
        uncollected_cost_kurus = 0
    WHERE id = p_sale_id;

    -- Kasa Hareket Kaydı (İptal)
    INSERT INTO public.kasa_movements (
        kasa_day_id, movement_type, amount_kurus, cash_portion_kurus, card_portion_kurus, description, created_by_user_id
    ) VALUES (
        v_sale.kasa_day_id, 'iptal', -v_sale.total_price_kurus, -v_sale.cash_paid_kurus, -v_sale.card_paid_kurus,
        'Satış İptali (' || v_sale.receipt_no || '): ' || p_justification, p_actor_user_id
    );

    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_actor_user_id, 'satis_iptal_edildi', 'kasa_sales', p_sale_id, jsonb_build_object('receipt_no', v_sale.receipt_no, 'justification', p_justification));

    RETURN to_jsonb(v_sale);
END;
$$;

COMMIT;
