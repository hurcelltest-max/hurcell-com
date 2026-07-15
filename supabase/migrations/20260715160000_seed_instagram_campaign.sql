-- supabase/migrations/20260715160000_seed_instagram_campaign.sql

INSERT INTO public.instagram_campaigns (campaign_code, campaign_name, is_active, metadata)
VALUES (
    'IG_VERESIYE_LAUNCH_20260715',
    'Veresiye Launch Campaign',
    true,
    '{"creatives": ["veresiye_static_01", "veresiye_story_01", "veresiye_reels_01"]}'::jsonb
)
ON CONFLICT (campaign_code) DO UPDATE
SET
    campaign_name = EXCLUDED.campaign_name,
    metadata = EXCLUDED.metadata;
