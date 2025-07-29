export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      dmarc_auth_results: {
        Row: {
          auth_type: string
          created_at: string
          domain: string
          id: string
          record_id: string
          result: string
          selector: string | null
        }
        Insert: {
          auth_type: string
          created_at?: string
          domain: string
          id?: string
          record_id: string
          result: string
          selector?: string | null
        }
        Update: {
          auth_type?: string
          created_at?: string
          domain?: string
          id?: string
          record_id?: string
          result?: string
          selector?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dmarc_auth_results_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "dmarc_records"
            referencedColumns: ["id"]
          },
        ]
      }
      dmarc_records: {
        Row: {
          count: number
          created_at: string
          disposition: string
          dkim_result: string
          envelope_to: string | null
          header_from: string
          id: string
          report_id: string
          source_ip: unknown
          spf_result: string
        }
        Insert: {
          count: number
          created_at?: string
          disposition: string
          dkim_result: string
          envelope_to?: string | null
          header_from: string
          id?: string
          report_id: string
          source_ip: unknown
          spf_result: string
        }
        Update: {
          count?: number
          created_at?: string
          disposition?: string
          dkim_result?: string
          envelope_to?: string | null
          header_from?: string
          id?: string
          report_id?: string
          source_ip?: unknown
          spf_result?: string
        }
        Relationships: [
          {
            foreignKeyName: "dmarc_records_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dmarc_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dmarc_reports: {
        Row: {
          created_at: string
          date_range_begin: number
          date_range_end: number
          domain: string
          id: string
          include_in_dashboard: boolean
          org_email: string | null
          org_name: string
          policy_dkim: string
          policy_domain: string
          policy_p: string
          policy_pct: number | null
          policy_sp: string | null
          policy_spf: string
          raw_xml: string | null
          report_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_range_begin: number
          date_range_end: number
          domain: string
          id?: string
          include_in_dashboard?: boolean
          org_email?: string | null
          org_name: string
          policy_dkim: string
          policy_domain: string
          policy_p: string
          policy_pct?: number | null
          policy_sp?: string | null
          policy_spf: string
          raw_xml?: string | null
          report_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_range_begin?: number
          date_range_end?: number
          domain?: string
          id?: string
          include_in_dashboard?: boolean
          org_email?: string | null
          org_name?: string
          policy_dkim?: string
          policy_domain?: string
          policy_p?: string
          policy_pct?: number | null
          policy_sp?: string | null
          policy_spf?: string
          raw_xml?: string | null
          report_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
