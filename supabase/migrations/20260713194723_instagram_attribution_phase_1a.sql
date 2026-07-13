-- supabase/migrations/20260713194723_instagram_attribution_phase_1a.sql

CREATE TABLE IF NOT EXISTS public.instagram_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_code TEXT UNIQUE NOT NULL CHECK (campaign_code ~ '^[A-Z0-9][A-Z0-9_-]{2,49}$'),
    campaign_name TEXT NOT NULL CHECK (char_length(trim(campaign_name)) > 0 AND char_length(campaign_name) <= 255),
    medium TEXT CHECK (medium IN ('organic', 'paid', 'other')),
    content_type TEXT CHECK (content_type IN ('post', 'reels', 'story', 'ad', 'bio', 'other')),
    instagram_content_id TEXT CHECK (char_length(instagram_content_id) <= 255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.attribution_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token_hash TEXT UNIQUE NOT NULL CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
    campaign_id UUID REFERENCES public.instagram_campaigns(id) ON DELETE SET NULL,
    campaign_code TEXT CHECK (campaign_code ~ '^[A-Z0-9][A-Z0-9_-]{2,49}$'),
    utm_source TEXT CHECK (char_length(utm_source) <= 100),
    utm_medium TEXT CHECK (char_length(utm_medium) <= 100),
    utm_campaign TEXT CHECK (char_length(utm_campaign) <= 100),
    utm_content TEXT CHECK (char_length(utm_content) <= 255),
    referrer TEXT CHECK (char_length(referrer) <= 1000),
    landing_path TEXT NOT NULL CHECK (
        landing_path LIKE '/%' AND
        landing_path NOT LIKE '//%' AND
        landing_path !~ '[\?#\\\s]' AND
        char_length(landing_path) <= 1000
    ),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > first_seen_at),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.funnel_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribution_session_id UUID NOT NULL REFERENCES public.attribution_sessions(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN ('landing_view', 'otp_requested', 'otp_verified', 'application_submitted')),
    event_key TEXT UNIQUE NOT NULL CHECK (event_key ~ '^[a-f0-9]{64}$'),
    phone_verification_id UUID REFERENCES public.phone_verifications(id) ON DELETE RESTRICT,
    credit_customer_id UUID REFERENCES public.credit_customers(id) ON DELETE RESTRICT,
    credit_account_id UUID REFERENCES public.credit_accounts(id) ON DELETE RESTRICT,
    agreement_acceptance_id UUID REFERENCES public.credit_agreement_acceptances(id) ON DELETE RESTRICT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (event_type = 'landing_view' AND phone_verification_id IS NULL AND credit_customer_id IS NULL AND credit_account_id IS NULL AND agreement_acceptance_id IS NULL) OR
        (event_type IN ('otp_requested', 'otp_verified') AND phone_verification_id IS NOT NULL AND credit_customer_id IS NULL AND credit_account_id IS NULL AND agreement_acceptance_id IS NULL) OR
        (event_type = 'application_submitted' AND phone_verification_id IS NOT NULL AND credit_customer_id IS NOT NULL AND credit_account_id IS NOT NULL AND agreement_acceptance_id IS NOT NULL)
    )
);

-- RLS
ALTER TABLE public.instagram_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Deny all to PUBLIC/anon/authenticated
REVOKE ALL ON public.instagram_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.attribution_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.funnel_events FROM PUBLIC, anon, authenticated;

-- Grant to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.attribution_sessions TO service_role;
GRANT SELECT, INSERT ON public.funnel_events TO service_role;

-- Append-only trigger for funnel_events
CREATE OR REPLACE FUNCTION public.prevent_funnel_events_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'funnel_events is an append-only table. UPDATE/DELETE are not allowed.';
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.prevent_funnel_events_update_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_funnel_events_modification ON public.funnel_events;
CREATE TRIGGER prevent_funnel_events_modification
BEFORE UPDATE OR DELETE ON public.funnel_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_funnel_events_update_delete();

-- Indexes (Do not recreate indexes on UNIQUE columns session_token_hash and event_key)
CREATE INDEX IF NOT EXISTS idx_attribution_sessions_campaign_id ON public.attribution_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_attribution_sessions_campaign_code ON public.attribution_sessions(campaign_code);
CREATE INDEX IF NOT EXISTS idx_attribution_sessions_expires_at ON public.attribution_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_funnel_events_session_id ON public.funnel_events(attribution_session_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_type ON public.funnel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_funnel_events_occurred_at ON public.funnel_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_funnel_events_phone_verif_id ON public.funnel_events(phone_verification_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_customer_id ON public.funnel_events(credit_customer_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_account_id ON public.funnel_events(credit_account_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_agreement_id ON public.funnel_events(agreement_acceptance_id);
