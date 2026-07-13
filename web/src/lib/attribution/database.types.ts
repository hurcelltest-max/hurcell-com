export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface AttributionDatabase {
  public: {
    Tables: {
      instagram_campaigns: {
        Row: {
          id: string;
          campaign_code: string;
          campaign_name: string;
          medium: 'organic' | 'paid' | 'other' | null;
          content_type: 'post' | 'reels' | 'story' | 'ad' | 'bio' | 'other' | null;
          instagram_content_id: string | null;
          is_active: boolean;
          starts_at: string | null;
          ends_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_code: string;
          campaign_name: string;
          medium?: 'organic' | 'paid' | 'other' | null;
          content_type?: 'post' | 'reels' | 'story' | 'ad' | 'bio' | 'other' | null;
          instagram_content_id?: string | null;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_code?: string;
          campaign_name?: string;
          medium?: 'organic' | 'paid' | 'other' | null;
          content_type?: 'post' | 'reels' | 'story' | 'ad' | 'bio' | 'other' | null;
          instagram_content_id?: string | null;
          is_active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attribution_sessions: {
        Row: {
          id: string;
          session_token_hash: string;
          campaign_id: string | null;
          campaign_code: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          referrer: string | null;
          landing_path: string;
          first_seen_at: string;
          last_seen_at: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_token_hash: string;
          campaign_id?: string | null;
          campaign_code?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          referrer?: string | null;
          landing_path: string;
          first_seen_at?: string;
          last_seen_at?: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_token_hash?: string;
          campaign_id?: string | null;
          campaign_code?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          referrer?: string | null;
          landing_path?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attribution_sessions_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "instagram_campaigns";
            referencedColumns: ["id"];
          }
        ];
      };
      funnel_events: {
        Row: {
          id: string;
          attribution_session_id: string;
          event_type: 'landing_view' | 'otp_requested' | 'otp_verified' | 'application_submitted';
          event_key: string;
          phone_verification_id: string | null;
          credit_customer_id: string | null;
          credit_account_id: string | null;
          agreement_acceptance_id: string | null;
          metadata: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          attribution_session_id: string;
          event_type: 'landing_view' | 'otp_requested' | 'otp_verified' | 'application_submitted';
          event_key: string;
          phone_verification_id?: string | null;
          credit_customer_id?: string | null;
          credit_account_id?: string | null;
          agreement_acceptance_id?: string | null;
          metadata?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          attribution_session_id?: string;
          event_type?: 'landing_view' | 'otp_requested' | 'otp_verified' | 'application_submitted';
          event_key?: string;
          phone_verification_id?: string | null;
          credit_customer_id?: string | null;
          credit_account_id?: string | null;
          agreement_acceptance_id?: string | null;
          metadata?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "funnel_events_attribution_session_id_fkey";
            columns: ["attribution_session_id"];
            isOneToOne: false;
            referencedRelation: "attribution_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      check_rate_limit_atomic: {
        Args: {
          p_identifier: string;
          p_action: string;
          p_max_requests: number;
          p_window_minutes: number;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
