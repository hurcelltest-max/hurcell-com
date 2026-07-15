export interface FinanceDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      create_finance_plan: {
        Args: {
          p_idempotency_key: string;
          p_customer_id: string;
          p_source_type: string;
          p_source_reference: string;
          p_principal_amount: number;
          p_down_payment_amount: number;
          p_term_rate_percent: number;
          p_installment_count: number;
          p_statement_day: number;
          p_first_due_date: string;
          p_created_by: string;
        };
        Returns: Record<string, unknown>;
      };
      record_finance_collection: {
        Args: {
          p_idempotency_key: string;
          p_plan_id: string;
          p_amount: number;
          p_payment_method: string;
          p_collection_kind: string;
          p_collected_at: string;
          p_created_by: string;
          p_note: string;
        };
        Returns: Record<string, unknown>;
      };
      cancel_finance_plan: {
        Args: {
          p_plan_id: string;
          p_admin_username: string;
          p_reason: string;
        };
        Returns: Record<string, unknown>;
      };
    };
  };
}
