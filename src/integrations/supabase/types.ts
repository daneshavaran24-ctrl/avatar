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
      app_settings: {
        Row: {
          answer_length: string
          avatar_chroma_key: string
          connection_status: Json
          custom_persona: string
          elevenlabs_enabled: boolean
          elevenlabs_model: string
          elevenlabs_similarity: number
          elevenlabs_stability: number
          elevenlabs_style: number
          elevenlabs_voice_id: string
          elevenlabs_voice_name: string
          formality_level: number
          groq_enabled: boolean
          heygen_avatar_id: string
          heygen_avatar_name: string
          heygen_avatar_preview: string | null
          heygen_enabled: boolean
          heygen_voice_id: string
          heygen_voice_name: string
          humor_level: number
          id: string
          openrouter_enabled: boolean
          openrouter_model: string
          political_block: boolean
          refusal_text: string
          religious_block: boolean
          stt_autosend: boolean
          stt_provider: string
          tone_preset: string
          transcript_retention_days: number
          tts_provider: string
          tts_speed: number
          tts_voice: string
          updated_at: string
        }
        Insert: {
          answer_length?: string
          avatar_chroma_key?: string
          connection_status?: Json
          custom_persona?: string
          elevenlabs_enabled?: boolean
          elevenlabs_model?: string
          elevenlabs_similarity?: number
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          elevenlabs_voice_name?: string
          formality_level?: number
          groq_enabled?: boolean
          heygen_avatar_id?: string
          heygen_avatar_name?: string
          heygen_avatar_preview?: string | null
          heygen_enabled?: boolean
          heygen_voice_id?: string
          heygen_voice_name?: string
          humor_level?: number
          id?: string
          openrouter_enabled?: boolean
          openrouter_model?: string
          political_block?: boolean
          refusal_text?: string
          religious_block?: boolean
          stt_autosend?: boolean
          stt_provider?: string
          tone_preset?: string
          transcript_retention_days?: number
          tts_provider?: string
          tts_speed?: number
          tts_voice?: string
          updated_at?: string
        }
        Update: {
          answer_length?: string
          avatar_chroma_key?: string
          connection_status?: Json
          custom_persona?: string
          elevenlabs_enabled?: boolean
          elevenlabs_model?: string
          elevenlabs_similarity?: number
          elevenlabs_stability?: number
          elevenlabs_style?: number
          elevenlabs_voice_id?: string
          elevenlabs_voice_name?: string
          formality_level?: number
          groq_enabled?: boolean
          heygen_avatar_id?: string
          heygen_avatar_name?: string
          heygen_avatar_preview?: string | null
          heygen_enabled?: boolean
          heygen_voice_id?: string
          heygen_voice_name?: string
          humor_level?: number
          id?: string
          openrouter_enabled?: boolean
          openrouter_model?: string
          political_block?: boolean
          refusal_text?: string
          religious_block?: boolean
          stt_autosend?: boolean
          stt_provider?: string
          tone_preset?: string
          transcript_retention_days?: number
          tts_provider?: string
          tts_speed?: number
          tts_voice?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          input_mode: string | null
          latency_ms: number | null
          role: string
          session_id: string
          source_type: string | null
          token_input: number | null
          token_output: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          input_mode?: string | null
          latency_ms?: number | null
          role: string
          session_id: string
          source_type?: string | null
          token_input?: number | null
          token_output?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          input_mode?: string | null
          latency_ms?: number | null
          role?: string
          session_id?: string
          source_type?: string | null
          token_input?: number | null
          token_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sessions: {
        Row: {
          client_label: string | null
          ended_at: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          client_label?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Update: {
          client_label?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata_json: Json
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata_json?: Json
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          chunk_count: number
          created_at: string
          error_message: string | null
          extracted_text: string
          id: string
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          extracted_text?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          extracted_text?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      provider_events: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          latency_ms: number | null
          operation: string
          provider: string
          session_id: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms?: number | null
          operation: string
          provider: string
          session_id?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms?: number | null
          operation?: string
          provider?: string
          session_id?: string | null
          success?: boolean
        }
        Relationships: []
      }
      provider_keys: {
        Row: {
          name: string
          updated_at: string
          value_ciphertext: string
        }
        Insert: {
          name: string
          updated_at?: string
          value_ciphertext: string
        }
        Update: {
          name?: string
          updated_at?: string
          value_ciphertext?: string
        }
        Relationships: []
      }
      retrieval_events: {
        Row: {
          chunk_id: string | null
          created_at: string
          document_id: string | null
          id: string
          message_id: string | null
          rank: number | null
          score: number | null
        }
        Insert: {
          chunk_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          message_id?: string | null
          rank?: number | null
          score?: number | null
        }
        Update: {
          chunk_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          message_id?: string | null
          rank?: number | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "retrieval_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          payload: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          payload?: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          payload?: Json
          version?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_knowledge_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          document_title: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
