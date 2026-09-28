-- ============================================================================
-- MIGRATION: V26 - Kasa 26-28 Eylül Devir ve Kapanış Sayımı Onarımı
-- ============================================================================
-- 1. 26.09.2026 Hatalı Kapanış Sayımının Korunarak Düzeltilmesi (6.740,00 TL)
-- 2. 28.09.2026 Açılış Devrinin 6.740,00 TL Olarak Onarılması
-- 3. Audit Loglarının Eksiksiz Yazılması (Yönetici Hür BAYSEL)
-- 4. Gelecekteki Yönetici Kapanış Sayım Düzeltmeleri için Güvenli RPC Tanımlanması
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_actor_id UUID := '1fdbe071-8975-4af2-88fd-a339eb71b2e6'; -- hur (yonetici)
    v_source_day_id UUID := 'ed42df8e-3b8b-419f-b7ce-44ca76bda33a'; -- 2026-09-26
    v_target_day_id UUID := '578752a2-5deb-424a-83b7-e0c5641000ef'; -- 2026-09-28
    v_confirmed_amount BIGINT := 674000; -- 6.740,00 TL (kuruş)
    v_source_day public.kasa_days%ROWTYPE;
    v_target_day public.kasa_days%ROWTYPE;
    v_actor public.kasa_users%ROWTYPE;
BEGIN
    -- 1. Yönetici Doğrulaması
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = v_actor_id;
    IF v_actor.id IS NULL OR v_actor.role <> 'yonetici' OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Devir düzeltmesi yalnızca aktif yöneticiler tarafından yapılabilir.';
    END IF;

    -- 2. 26 Eylül Gününün Kontrolü ve Düzeltilmesi
    SELECT * INTO v_source_day FROM public.kasa_days WHERE id = v_source_day_id;
    IF v_source_day.id IS NULL THEN
        RAISE EXCEPTION 'Kaynak kasa günü (2026-09-26) bulunamadı.';
    END IF;

    -- Kaynak günün sayımını ve farkını düzelt (orijinal notu koruyarak yönetici notu ekle)
    UPDATE public.kasa_days
    SET counted_cash_kurus = v_confirmed_amount,
        cash_difference_kurus = 0,
        closing_note = CASE 
            WHEN closing_note IS NULL THEN 'Yönetici Düzeltmesi (Hür BAYSEL): Fiziksel sayım 6.740,00 TL doğrulandı.'
            WHEN closing_note NOT LIKE '%Yönetici Düzeltmesi%' THEN closing_note || ' | Yönetici Düzeltmesi (Hür BAYSEL): Fiziksel sayım 6.740,00 TL doğrulandı.'
            ELSE closing_note
        END
    WHERE id = v_source_day_id;

    -- 26 Eylül kapanış sayımı hareketini güncelle
    UPDATE public.kasa_movements
    SET amount_kurus = v_confirmed_amount,
        description = 'Gün Sonu Kapanış Sayımı (Sayılan: 6740.00 TL, Beklenen: 6740.00 TL, Fark: 0.00 TL - Yönetici Düzeltmeli)',
        justification = '26.09.2026 hatalı 0 TL kapanış sayımı yönetici onayıyla düzeltildi.'
    WHERE kasa_day_id = v_source_day_id AND movement_type = 'gun_sonu_kapanis';

    -- 26 Eylül için Audit Log Kaydı
    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details, justification)
    VALUES (
        v_actor_id,
        'kapanis_sayimi_duzeltildi',
        'kasa_days',
        v_source_day_id,
        jsonb_build_object(
            'source_date', '2026-09-26',
            'old_counted_cash_kurus', v_source_day.counted_cash_kurus,
            'new_counted_cash_kurus', v_confirmed_amount,
            'old_cash_difference_kurus', v_source_day.cash_difference_kurus,
            'new_cash_difference_kurus', 0,
            'original_closing_note', v_source_day.closing_note,
            'actor', 'hur',
            'reason', 'Yönetici Hür BAYSEL onayıyla fiziksel nakit sayımı 6.740,00 TL olarak doğrulandı ve fark sıfırlandı.'
        ),
        '26 Eylül hatalı kapanış sayımı onaylanan fiziksel nakit tutarı ile düzeltildi.'
    );

    -- 3. 28 Eylül Gününün Kontrolü ve Açılış Devrinin Onarılması
    SELECT * INTO v_target_day FROM public.kasa_days WHERE id = v_target_day_id;
    IF v_target_day.id IS NULL THEN
        RAISE EXCEPTION 'Hedef kasa günü (2026-09-28) bulunamadı.';
    END IF;

    UPDATE public.kasa_days
    SET opening_balance_kurus = v_confirmed_amount,
        is_opening_repaired = true,
        repair_note = '26.09.2026 hatalı sıfır sayımı yönetici onayıyla düzeltildi, 6.740,00 TL devir devralındı.'
    WHERE id = v_target_day_id;

    -- 28 Eylül açılış hareketi güncellemesi
    UPDATE public.kasa_movements
    SET amount_kurus = v_confirmed_amount,
        description = 'Kasa Açılışı / Önceki Gün Devri (Kaynak: 2026-09-26 - Yönetici Düzeltmeli)',
        justification = '26.09.2026 kaynak gününden 6.740,00 TL devir aktarıldı.'
    WHERE kasa_day_id = v_target_day_id AND movement_type = 'acilis_bakiyesi';

    -- 28 Eylül carryover_repair hareketi ekle (idempotent)
    INSERT INTO public.kasa_movements (
        kasa_day_id,
        movement_type,
        amount_kurus,
        cash_portion_kurus,
        card_portion_kurus,
        description,
        justification,
        created_by_user_id
    )
    SELECT
        v_target_day_id,
        'carryover_repair',
        v_confirmed_amount,
        0,
        0,
        'Devir Onarımı (Kaynak Gün: 2026-09-26): 26.09.2026 hatalı sıfır sayımı yönetici onayıyla düzeltildi, 6.740,00 TL devir devralındı.',
        'Yönetici onayıyla 28 Eylül açılış devri 6.740,00 TL olarak onarıldı.',
        v_actor_id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.kasa_movements
        WHERE kasa_day_id = v_target_day_id AND movement_type = 'carryover_repair'
    );

    -- 28 Eylül için Audit Log Kaydı
    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details, justification)
    VALUES (
        v_actor_id,
        'devir_onarildi',
        'kasa_days',
        v_target_day_id,
        jsonb_build_object(
            'target_date', '2026-09-28',
            'source_date', '2026-09-26',
            'old_opening_balance_kurus', v_target_day.opening_balance_kurus,
            'new_opening_balance_kurus', v_confirmed_amount,
            'actor', 'hur',
            'justification', '26.09.2026 hatalı sıfır sayımı yönetici onayıyla düzeltildi, 6.740,00 TL devir devralındı.'
        ),
        '28 Eylül açılış devir bakiyesi 6.740,00 TL olarak onarıldı.'
    );

END $$;

-- 4. GELECEKTEKİ YÖNETİCİ SAYIM VE DEVİR DÜZELTMELERİ İÇİN GÜVENLİ RPC
CREATE OR REPLACE FUNCTION public.fn_kasa_correct_day_closing_count(
    p_actor_user_id UUID,
    p_closed_day_id UUID,
    p_new_counted_cash_kurus BIGINT,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor public.kasa_users%ROWTYPE;
    v_closed_day public.kasa_days%ROWTYPE;
    v_next_open_day public.kasa_days%ROWTYPE;
    v_old_counted BIGINT;
    v_old_diff BIGINT;
    v_new_diff BIGINT;
BEGIN
    SELECT * INTO v_actor FROM public.kasa_users WHERE id = p_actor_user_id;
    IF v_actor.id IS NULL OR v_actor.role <> 'yonetici' OR NOT v_actor.is_active THEN
        RAISE EXCEPTION 'YETKİSİZ: Kapanış sayımı düzeltmesi yalnızca aktif yöneticiler tarafından yapılabilir.';
    END IF;

    IF p_justification IS NULL OR trim(p_justification) = '' THEN
        RAISE EXCEPTION 'GEÇERSİZ_PARAMETRE: Sayım düzeltmesi için gerekçe belirtilmesi zorunludur.';
    END IF;

    IF p_new_counted_cash_kurus < 0 THEN
        RAISE EXCEPTION 'GEÇERSİZ_TUTAR: Sayılan nakit tutarı negatif olamaz.';
    END IF;

    SELECT * INTO v_closed_day FROM public.kasa_days WHERE id = p_closed_day_id FOR UPDATE;
    IF v_closed_day.id IS NULL THEN
        RAISE EXCEPTION 'BULUNAMADI: Kasa günü bulunamadı.';
    END IF;

    IF v_closed_day.status <> 'closed' THEN
        RAISE EXCEPTION 'GEÇERSİZ_DURUM: Yalnızca kapanmış günlerin kapanış sayımı düzeltilebilir.';
    END IF;

    v_old_counted := COALESCE(v_closed_day.counted_cash_kurus, 0);
    v_old_diff := COALESCE(v_closed_day.cash_difference_kurus, 0);
    v_new_diff := p_new_counted_cash_kurus - COALESCE(v_closed_day.expected_cash_kurus, 0);

    UPDATE public.kasa_days SET
        counted_cash_kurus = p_new_counted_cash_kurus,
        cash_difference_kurus = v_new_diff,
        closing_note = CASE 
            WHEN closing_note IS NULL THEN 'Yönetici Düzeltmesi (' || v_actor.username || '): ' || trim(p_justification)
            WHEN closing_note NOT LIKE '%Yönetici Düzeltmesi%' THEN closing_note || ' | Yönetici Düzeltmesi (' || v_actor.username || '): ' || trim(p_justification)
            ELSE closing_note
        END
    WHERE id = p_closed_day_id
    RETURNING * INTO v_closed_day;

    -- Kapanış sayım hareketini güncelle
    UPDATE public.kasa_movements SET
        amount_kurus = p_new_counted_cash_kurus,
        description = 'Gün Sonu Kapanış Sayımı (Sayılan: ' || (p_new_counted_cash_kurus / 100.0) || ' TL, Beklenen: ' || (COALESCE(v_closed_day.expected_cash_kurus, 0) / 100.0) || ' TL, Fark: ' || (v_new_diff / 100.0) || ' TL - Yönetici Düzeltmeli)',
        justification = trim(p_justification)
    WHERE kasa_day_id = p_closed_day_id AND movement_type = 'gun_sonu_kapanis';

    -- Audit Log Kaydı
    INSERT INTO public.kasa_audit_logs (user_id, action, entity_type, entity_id, details, justification)
    VALUES (
        p_actor_user_id,
        'kapanis_sayimi_duzeltildi',
        'kasa_days',
        p_closed_day_id,
        jsonb_build_object(
            'date_val', v_closed_day.date_val,
            'old_counted_cash_kurus', v_old_counted,
            'new_counted_cash_kurus', p_new_counted_cash_kurus,
            'old_cash_difference_kurus', v_old_diff,
            'new_cash_difference_kurus', v_new_diff,
            'justification', trim(p_justification)
        ),
        trim(p_justification)
    );

    -- Eğer hemen ardışık açık gün varsa onun açılış devrini de otomatik onar
    SELECT * INTO v_next_open_day
    FROM public.kasa_days
    WHERE date_val > v_closed_day.date_val AND status = 'open'
    ORDER BY date_val ASC
    LIMIT 1;

    IF v_next_open_day.id IS NOT NULL THEN
        UPDATE public.kasa_days SET
            opening_balance_kurus = p_new_counted_cash_kurus,
            is_opening_repaired = true,
            repair_note = 'Kaynak gün (' || v_closed_day.date_val || ') sayım düzeltmesi ile devir güncellendi: ' || trim(p_justification)
        WHERE id = v_next_open_day.id;

        UPDATE public.kasa_movements SET
            amount_kurus = p_new_counted_cash_kurus,
            description = 'Kasa Açılışı / Önceki Gün Devri (Kaynak: ' || v_closed_day.date_val || ' - Yönetici Düzeltmeli)',
            justification = trim(p_justification)
        WHERE kasa_day_id = v_next_open_day.id AND movement_type = 'acilis_bakiyesi';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'closed_day', to_jsonb(v_closed_day),
        'next_open_day_repaired', v_next_open_day.id IS NOT NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_kasa_correct_day_closing_count(UUID, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kasa_correct_day_closing_count(UUID, UUID, BIGINT, TEXT) TO service_role;

COMMIT;
