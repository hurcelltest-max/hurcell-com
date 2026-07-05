-- 20260705020000_sms_otp_and_notifications.sql

-- 1. phone_verifications table
CREATE TABLE IF NOT EXISTS public.phone_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    verification_token_hash VARCHAR(255),
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent_hash VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON public.phone_verifications(phone);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_token ON public.phone_verifications(verification_token_hash);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_expires ON public.phone_verifications(expires_at);

-- RPC for atomic token consumption
CREATE OR REPLACE FUNCTION public.consume_phone_verification_token(p_phone VARCHAR, p_token_hash VARCHAR)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    UPDATE public.phone_verifications
    SET consumed_at = now()
    WHERE phone = p_phone
      AND verification_token_hash = p_token_hash
      AND consumed_at IS NULL
      AND verified_at IS NOT NULL
      AND expires_at > now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.consume_phone_verification_token(VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_phone_verification_token(VARCHAR, VARCHAR) TO service_role;


-- 2. rate_limits table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    request_count INT NOT NULL DEFAULT 1 CHECK (request_count >= 0),
    window_starts_at TIMESTAMPTZ NOT NULL,
    window_ends_at TIMESTAMPTZ NOT NULL
);

-- Unique index for atomic UPSERT on rate limit windows
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_identifier_action_window 
ON public.rate_limits(identifier, action, window_starts_at);

-- RPC for atomic rate limit checking and incrementing
CREATE OR REPLACE FUNCTION public.check_rate_limit_atomic(
    p_identifier VARCHAR, 
    p_action VARCHAR, 
    p_max_requests INT, 
    p_window_minutes INT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
    v_current_count INT;
BEGIN
    IF p_window_minutes <= 0 OR p_max_requests <= 0 THEN
        RETURN FALSE;
    END IF;

    -- Align window to the current X-minute boundary for deterministic upsert target
    -- For example, if p_window_minutes is 10, align to 10-minute intervals
    v_window_start := date_trunc('hour', now()) + 
                      INTERVAL '1 minute' * (EXTRACT(minute FROM now())::int / p_window_minutes * p_window_minutes);
    v_window_end := v_window_start + (p_window_minutes || ' minutes')::interval;

    INSERT INTO public.rate_limits (identifier, action, request_count, window_starts_at, window_ends_at)
    VALUES (p_identifier, p_action, 1, v_window_start, v_window_end)
    ON CONFLICT (identifier, action, window_starts_at) 
    DO UPDATE SET request_count = rate_limits.request_count + 1
    RETURNING request_count INTO v_current_count;

    IF v_current_count > p_max_requests THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_rate_limit_atomic(VARCHAR, VARCHAR, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_atomic(VARCHAR, VARCHAR, INT, INT) TO service_role;


-- 3. sms_notifications table
CREATE TABLE IF NOT EXISTS public.sms_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('customer', 'internal')),
    recipient_phone VARCHAR(20) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    dedupe_key VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempt_count INT NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    provider_message_id VARCHAR(255),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_notifications_order_id ON public.sms_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_dedupe_key ON public.sms_notifications(dedupe_key);


-- RLS setup (secure tables, no direct public access)
-- By enabling RLS without creating any policies, we establish a "default deny" rule.
-- The 'anon' and 'authenticated' (public client) roles will have NO read or write access.
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.phone_verifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sms_notifications FROM PUBLIC, anon, authenticated;

-- Allow service role full access (this is the role used by our server-side API routes via supabaseAdmin)
GRANT ALL ON TABLE public.phone_verifications TO service_role;
GRANT ALL ON TABLE public.rate_limits TO service_role;
GRANT ALL ON TABLE public.sms_notifications TO service_role;
