export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chem_ghs: {
        Row: {
          cas_no: string
          fetched_at: string
          hazard_list: Json | null
          pictogram_cd: string[] | null
          sbstn_id: string | null
          signal_word: string | null
          un_no: string | null
        }
        Insert: {
          cas_no: string
          fetched_at?: string
          hazard_list?: Json | null
          pictogram_cd?: string[] | null
          sbstn_id?: string | null
          signal_word?: string | null
          un_no?: string | null
        }
        Update: {
          cas_no?: string
          fetched_at?: string
          hazard_list?: Json | null
          pictogram_cd?: string[] | null
          sbstn_id?: string | null
          signal_word?: string | null
          un_no?: string | null
        }
        Relationships: []
      }
      chem_section: {
        Row: {
          chem_id: string
          fetched_at: string
          payload: Json
          section_no: number
        }
        Insert: {
          chem_id: string
          fetched_at?: string
          payload: Json
          section_no: number
        }
        Update: {
          chem_id?: string
          fetched_at?: string
          payload?: Json
          section_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "chem_section_chem_id_fkey"
            columns: ["chem_id"]
            isOneToOne: false
            referencedRelation: "chem_substance"
            referencedColumns: ["chem_id"]
          },
        ]
      }
      chem_substance: {
        Row: {
          cas_no: string | null
          chem_id: string
          chem_name_kor: string
          en_no: string | null
          fetched_at: string
          ke_no: string | null
          last_date: string | null
          un_no: string | null
        }
        Insert: {
          cas_no?: string | null
          chem_id: string
          chem_name_kor: string
          en_no?: string | null
          fetched_at?: string
          ke_no?: string | null
          last_date?: string | null
          un_no?: string | null
        }
        Update: {
          cas_no?: string | null
          chem_id?: string
          chem_name_kor?: string
          en_no?: string | null
          fetched_at?: string
          ke_no?: string | null
          last_date?: string | null
          un_no?: string | null
        }
        Relationships: []
      }
      company_profile_defaults: {
        Row: {
          business_name: string
          business_number: string
          created_at: string
          headquarters_address: string
          industry: string
          management_number: string
          updated_at: string
        }
        Insert: {
          business_name: string
          business_number: string
          created_at?: string
          headquarters_address: string
          industry: string
          management_number: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          business_number?: string
          created_at?: string
          headquarters_address?: string
          industry?: string
          management_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      law_articles: {
        Row: {
          article_number: string
          article_title: string
          compliance_checklist: string[] | null
          created_at: string | null
          hazard_types: string[]
          id: string
          law_name: string
          remedial_actions: string[]
          source_url: string | null
          summary: string
        }
        Insert: {
          article_number: string
          article_title: string
          compliance_checklist?: string[] | null
          created_at?: string | null
          hazard_types: string[]
          id?: string
          law_name: string
          remedial_actions: string[]
          source_url?: string | null
          summary: string
        }
        Update: {
          article_number?: string
          article_title?: string
          compliance_checklist?: string[] | null
          created_at?: string | null
          hazard_types?: string[]
          id?: string
          law_name?: string
          remedial_actions?: string[]
          source_url?: string | null
          summary?: string
        }
        Relationships: []
      }
      risk_assessment_history: {
        Row: {
          accident_data: Json
          context_text: string
          created_at: string
          expires_at: string
          form_type: string
          id: string
          risk_rows: Json
          scope_hash: string
          site_name: string
          task_name: string
          validation_events: Json
          validation_summary: Json
          work_date: string | null
        }
        Insert: {
          accident_data?: Json
          context_text?: string
          created_at?: string
          expires_at?: string
          form_type?: string
          id?: string
          risk_rows?: Json
          scope_hash: string
          site_name?: string
          task_name: string
          validation_events?: Json
          validation_summary?: Json
          work_date?: string | null
        }
        Update: {
          accident_data?: Json
          context_text?: string
          created_at?: string
          expires_at?: string
          form_type?: string
          id?: string
          risk_rows?: Json
          scope_hash?: string
          site_name?: string
          task_name?: string
          validation_events?: Json
          validation_summary?: Json
          work_date?: string | null
        }
        Relationships: []
      }
      risk_assessment_participants: {
        Row: {
          affiliation: string
          assessment_id: string
          created_at: string
          id: string
          method: string
          name: string
          note: string
          participated_at: string | null
          role: string
        }
        Insert: {
          affiliation?: string
          assessment_id: string
          created_at?: string
          id?: string
          method?: string
          name: string
          note?: string
          participated_at?: string | null
          role?: string
        }
        Update: {
          affiliation?: string
          assessment_id?: string
          created_at?: string
          id?: string
          method?: string
          name?: string
          note?: string
          participated_at?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessment_participants_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "risk_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessment_rows: {
        Row: {
          acceptability: string
          acceptability_basis: string
          assessment_id: string
          category: string
          cause: string
          completion_date: string | null
          completion_note: string
          control_intent: string | null
          created_at: string
          current_measure: string
          frequency: number
          hazard_factor: string
          id: string
          improvement_date: string | null
          improvement_status: string
          legal_basis: string
          post_acceptability: string | null
          post_frequency: number | null
          post_risk_level: string
          post_severity: number | null
          reduction_measure: string
          responsible_person: string
          review_meta: Json
          risk_level: string
          row_index: number
          severity: number
          updated_at: string
          validation_status: string
          work_process: string
        }
        Insert: {
          acceptability?: string
          acceptability_basis?: string
          assessment_id: string
          category?: string
          cause?: string
          completion_date?: string | null
          completion_note?: string
          control_intent?: string | null
          created_at?: string
          current_measure?: string
          frequency?: number
          hazard_factor?: string
          id?: string
          improvement_date?: string | null
          improvement_status?: string
          legal_basis?: string
          post_acceptability?: string | null
          post_frequency?: number | null
          post_risk_level?: string
          post_severity?: number | null
          reduction_measure?: string
          responsible_person?: string
          review_meta?: Json
          risk_level?: string
          row_index: number
          severity?: number
          updated_at?: string
          validation_status?: string
          work_process?: string
        }
        Update: {
          acceptability?: string
          acceptability_basis?: string
          assessment_id?: string
          category?: string
          cause?: string
          completion_date?: string | null
          completion_note?: string
          control_intent?: string | null
          created_at?: string
          current_measure?: string
          frequency?: number
          hazard_factor?: string
          id?: string
          improvement_date?: string | null
          improvement_status?: string
          legal_basis?: string
          post_acceptability?: string | null
          post_frequency?: number | null
          post_risk_level?: string
          post_severity?: number | null
          reduction_measure?: string
          responsible_person?: string
          review_meta?: Json
          risk_level?: string
          row_index?: number
          severity?: number
          updated_at?: string
          validation_status?: string
          work_process?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessment_rows_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "risk_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessment_shares: {
        Row: {
          assessment_id: string
          audience_note: string
          content: string
          created_at: string
          id: string
          method: string
          phase: string
          recorded_by: string
          shared_at: string
        }
        Insert: {
          assessment_id: string
          audience_note?: string
          content?: string
          created_at?: string
          id?: string
          method?: string
          phase: string
          recorded_by?: string
          shared_at?: string
        }
        Update: {
          assessment_id?: string
          audience_note?: string
          content?: string
          created_at?: string
          id?: string
          method?: string
          phase?: string
          recorded_by?: string
          shared_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessment_shares_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "risk_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessments: {
        Row: {
          analysis_snapshot: Json
          created_at: string
          evaluator: string
          id: string
          industry: string
          owner_id: string | null
          reference_level: string | null
          reference_score: number | null
          retain_until: string
          scope_hash: string
          site_name: string
          status: string
          task_description: string
          task_name: string
          updated_at: string
          work_date: string | null
          work_location: string
        }
        Insert: {
          analysis_snapshot?: Json
          created_at?: string
          evaluator?: string
          id?: string
          industry?: string
          owner_id?: string | null
          reference_level?: string | null
          reference_score?: number | null
          retain_until?: string
          scope_hash: string
          site_name?: string
          status?: string
          task_description?: string
          task_name: string
          updated_at?: string
          work_date?: string | null
          work_location?: string
        }
        Update: {
          analysis_snapshot?: Json
          created_at?: string
          evaluator?: string
          id?: string
          industry?: string
          owner_id?: string | null
          reference_level?: string | null
          reference_score?: number | null
          retain_until?: string
          scope_hash?: string
          site_name?: string
          status?: string
          task_description?: string
          task_name?: string
          updated_at?: string
          work_date?: string | null
          work_location?: string
        }
        Relationships: []
      }
      risk_row_validation_audit: {
        Row: {
          created_at: string
          detected_hazard_type: string
          event_timestamp: string | null
          expected_hazard_type: string
          field: string
          final_status: string
          form_type: string
          id: number
          metadata: Json
          reason_code: string
          rewritten: boolean
          row_index: number
          site_name: string
          source: string
        }
        Insert: {
          created_at?: string
          detected_hazard_type?: string
          event_timestamp?: string | null
          expected_hazard_type?: string
          field: string
          final_status?: string
          form_type?: string
          id?: number
          metadata?: Json
          reason_code: string
          rewritten?: boolean
          row_index: number
          site_name?: string
          source?: string
        }
        Update: {
          created_at?: string
          detected_hazard_type?: string
          event_timestamp?: string | null
          expected_hazard_type?: string
          field?: string
          final_status?: string
          form_type?: string
          id?: number
          metadata?: Json
          reason_code?: string
          rewritten?: boolean
          row_index?: number
          site_name?: string
          source?: string
        }
        Relationships: []
      }
      safety_qa_history: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_answer_mode: string
          messages: Json
          scope_hash: string
          session_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          last_answer_mode?: string
          messages?: Json
          scope_hash: string
          session_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_answer_mode?: string
          messages?: Json
          scope_hash?: string
          session_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      scan_history: {
        Row: {
          chem_id: string | null
          created_at: string
          discrepancies: Json | null
          doc_type: string | null
          extraction: Json | null
          id: string
          locale: string | null
          resolved_by: string | null
          user_id: string | null
        }
        Insert: {
          chem_id?: string | null
          created_at?: string
          discrepancies?: Json | null
          doc_type?: string | null
          extraction?: Json | null
          id?: string
          locale?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Update: {
          chem_id?: string | null
          created_at?: string
          discrepancies?: Json | null
          doc_type?: string | null
          extraction?: Json | null
          id?: string
          locale?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_work_history: {
        Row: {
          created_at: string
          feature: string
          id: string
          input_payload: Json
          result_payload: Json
          subtitle: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          input_payload?: Json
          result_payload?: Json
          subtitle?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          input_payload?: Json
          result_payload?: Json
          subtitle?: string
          title?: string
          updated_at?: string
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


