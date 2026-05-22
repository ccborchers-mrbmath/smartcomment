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
      assessment_marks: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          raw_mark: number | null
          status: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          raw_mark?: number | null
          status?: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          raw_mark?: number | null
          status?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_marks_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          class_id: string
          created_at: string
          description: string
          id: string
          max_marks: number
          name: string
          position: number
          teacher_id: string
          term: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          class_id: string
          created_at?: string
          description?: string
          id?: string
          max_marks?: number
          name?: string
          position?: number
          teacher_id: string
          term?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          class_id?: string
          created_at?: string
          description?: string
          id?: string
          max_marks?: number
          name?: string
          position?: number
          teacher_id?: string
          term?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      classes: {
        Row: {
          active_term: string | null
          created_at: string
          id: string
          name: string
          requirements: Json
          subject: string | null
          teacher_id: string
          term: string | null
          updated_at: string
          year_grade: string | null
        }
        Insert: {
          active_term?: string | null
          created_at?: string
          id?: string
          name: string
          requirements?: Json
          subject?: string | null
          teacher_id: string
          term?: string | null
          updated_at?: string
          year_grade?: string | null
        }
        Update: {
          active_term?: string | null
          created_at?: string
          id?: string
          name?: string
          requirements?: Json
          subject?: string | null
          teacher_id?: string
          term?: string | null
          updated_at?: string
          year_grade?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          category: string
          created_at: string
          email: string | null
          id: string
          message: string
          page: string | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message: string
          page?: string | null
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          page?: string | null
          user_id?: string
        }
        Relationships: []
      }
      feedback_replies: {
        Row: {
          author_id: string
          created_at: string
          feedback_id: string
          id: string
          message: string
        }
        Insert: {
          author_id?: string
          created_at?: string
          feedback_id: string
          id?: string
          message: string
        }
        Update: {
          author_id?: string
          created_at?: string
          feedback_id?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_replies_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_comments: {
        Row: {
          created_at: string
          id: string
          model: string | null
          student_id: string
          teacher_id: string
          text: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          model?: string | null
          student_id: string
          teacher_id: string
          text: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          model?: string | null
          student_id?: string
          teacher_id?: string
          text?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "generated_comments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          credits_balance: number
          email: string | null
          full_name: string | null
          id: string
          school_email: string | null
          school_email_verified_at: string | null
          school_sponsored: boolean
          subscription_status: string
          trial_started_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_balance?: number
          email?: string | null
          full_name?: string | null
          id: string
          school_email?: string | null
          school_email_verified_at?: string | null
          school_sponsored?: boolean
          subscription_status?: string
          trial_started_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_balance?: number
          email?: string | null
          full_name?: string | null
          id?: string
          school_email?: string | null
          school_email_verified_at?: string | null
          school_sponsored?: boolean
          subscription_status?: string
          trial_started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_admins: {
        Row: {
          created_at: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_admins_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_email_verifications: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          created_at: string
          domain: string
          id: string
          locked_fields: string[]
          name: string | null
          requirements: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          locked_fields?: string[]
          name?: string | null
          requirements?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          locked_fields?: string[]
          name?: string | null
          requirements?: Json
          updated_at?: string
        }
        Relationships: []
      }
      student_inputs: {
        Row: {
          created_at: string
          id: string
          media_path: string | null
          media_url: string | null
          student_id: string
          teacher_id: string
          term: string | null
          text: string | null
          transcript: string | null
          type: Database["public"]["Enums"]["input_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          media_path?: string | null
          media_url?: string | null
          student_id: string
          teacher_id: string
          term?: string | null
          text?: string | null
          transcript?: string | null
          type: Database["public"]["Enums"]["input_type"]
        }
        Update: {
          created_at?: string
          id?: string
          media_path?: string | null
          media_url?: string | null
          student_id?: string
          teacher_id?: string
          term?: string | null
          text?: string | null
          transcript?: string | null
          type?: Database["public"]["Enums"]["input_type"]
        }
        Relationships: [
          {
            foreignKeyName: "student_inputs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_reports: {
        Row: {
          created_at: string
          id: string
          interventions: string | null
          student_id: string
          synthesis: string
          teacher_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interventions?: string | null
          student_id: string
          synthesis: string
          teacher_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interventions?: string | null
          student_id?: string
          synthesis?: string
          teacher_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          class_id: string
          created_at: string
          first_name: string | null
          id: string
          included_terms: string[]
          last_name: string | null
          name: string
          overrides: Json
          position: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          first_name?: string | null
          id?: string
          included_terms?: string[]
          last_name?: string | null
          name: string
          overrides?: Json
          position?: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          first_name?: string | null
          id?: string
          included_terms?: string[]
          last_name?: string | null
          name?: string
          overrides?: Json
          position?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      style_samples: {
        Row: {
          active: boolean
          created_at: string
          grade: string
          id: string
          source: string | null
          teacher_id: string
          text: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          grade?: string
          id?: string
          source?: string | null
          teacher_id: string
          text: string
        }
        Update: {
          active?: boolean
          created_at?: string
          grade?: string
          id?: string
          source?: string | null
          teacher_id?: string
          text?: string
        }
        Relationships: []
      }
      teacher_defaults: {
        Row: {
          created_at: string
          requirements: Json
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          requirements?: Json
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          requirements?: Json
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          attributed_domain: string | null
          cost_usd_estimate: number
          created_at: string
          credits_used: number
          function_name: string
          id: string
          metadata: Json
          school_id: string | null
          units: number
          user_id: string
        }
        Insert: {
          attributed_domain?: string | null
          cost_usd_estimate?: number
          created_at?: string
          credits_used?: number
          function_name: string
          id?: string
          metadata?: Json
          school_id?: string | null
          units?: number
          user_id: string
        }
        Update: {
          attributed_domain?: string | null
          cost_usd_estimate?: number
          created_at?: string
          credits_used?: number
          function_name?: string
          id?: string
          metadata?: Json
          school_id?: string | null
          units?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      usage_by_domain_daily: {
        Row: {
          cost_usd: number | null
          credits: number | null
          day: string | null
          domain: string | null
          events: number | null
          units: number | null
        }
        Relationships: []
      }
      usage_by_school_monthly: {
        Row: {
          active_users: number | null
          cost_usd: number | null
          credits: number | null
          events: number | null
          month: string | null
          school_id: string | null
          units: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      attribute_usage: {
        Args: { _uid: string }
        Returns: {
          domain: string
          school_id: string
        }[]
      }
      email_domain: { Args: { _uid: string }; Returns: string }
      has_active_access: { Args: { _uid: string }; Returns: boolean }
      is_school_admin: {
        Args: { _school_id: string; _uid: string }
        Returns: boolean
      }
      is_school_domain_allowed: { Args: { _email: string }; Returns: boolean }
      is_super_admin: { Args: { _uid: string }; Returns: boolean }
      school_for_user: { Args: { _uid: string }; Returns: string }
    }
    Enums: {
      input_type: "voice" | "handwriting" | "typed" | "file"
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
    Enums: {
      input_type: ["voice", "handwriting", "typed", "file"],
    },
  },
} as const
