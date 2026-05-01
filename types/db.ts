// =============================================================================
// Supabase Database 型定義
//
// supabase gen types typescript --project-id <id> --schema public が出力する
// 形式に合わせて手書きしている。スキーマを更新したら CLI で上書きする想定。
// =============================================================================

// Json: 再帰型にすると Customer 配列のミューテーション等で TS2589 が出るため、
// 1レベルだけ展開した非再帰版に固定する。実用上は jsonb の表現として十分。
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: unknown }
  | unknown[]

type Industry =
  | 'concafe'
  | 'menkon'
  | 'kyaba'
  | 'host'
  | 'fuzoku'
  | 'bar_female'
  | 'bar_male'
  | 'other'
type SafetyMode = 'safe' | 'normal' | 'loose'
type Channel = 'dm' | 'x_post' | 'thanks'
type CustomerTypeLit =
  | 'futo'
  | 'ita'
  | 'mame'
  | 'shio'
  | 'oshi_gachi'
  | 'oshi_enjoy'
  | 'other_oshi'
  | 'kake_mochi'
  | 'peer_cast'
type GenerationMode = 'general' | 'personal' | 'reply' | 'thanks' | 'public_post'
type ToneSampleSource = 'auto_edited' | 'manual'
type ConversationMemoSource = 'manual' | 'tool_use_approved'

export interface Database {
  public: {
    Tables: {
      user_profile: {
        Row: {
          user_id: string
          industry: Industry
          genji_name: string | null
          safety_mode: SafetyMode
          tone_features: Json
          ng_words: Json
          x_post_hashtags: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          industry: Industry
          genji_name?: string | null
          safety_mode?: SafetyMode
          tone_features?: Json
          ng_words?: Json
          x_post_hashtags?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          industry?: Industry
          genji_name?: string | null
          safety_mode?: SafetyMode
          tone_features?: Json
          ng_words?: Json
          x_post_hashtags?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      tone_samples: {
        Row: {
          id: string
          user_id: string
          channel: Channel
          content: string
          source: ToneSampleSource
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          channel: Channel
          content: string
          source: ToneSampleSource
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          channel?: Channel
          content?: string
          source?: ToneSampleSource
          created_at?: string
        }
        Relationships: []
      }

      customers: {
        Row: {
          id: string
          user_id: string
          nickname: string
          age: number | null
          occupation: string | null
          preferences: Json
          customer_type: CustomerTypeLit | null
          relation_score: number | null
          ng_time: string | null
          last_visit_at: string | null
          cheki_count: number
          goods_owned: Json
          oshi_rank: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nickname: string
          age?: number | null
          occupation?: string | null
          preferences?: Json
          customer_type?: CustomerTypeLit | null
          relation_score?: number | null
          ng_time?: string | null
          last_visit_at?: string | null
          cheki_count?: number
          goods_owned?: Json
          oshi_rank?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nickname?: string
          age?: number | null
          occupation?: string | null
          preferences?: Json
          customer_type?: CustomerTypeLit | null
          relation_score?: number | null
          ng_time?: string | null
          last_visit_at?: string | null
          cheki_count?: number
          goods_owned?: Json
          oshi_rank?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      visit_logs: {
        Row: {
          id: string
          user_id: string
          customer_id: string
          visit_date: string
          amount: number | null
          is_dohan: boolean
          is_after: boolean
          cheki_taken: number
          gifts_received: Json
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          customer_id: string
          visit_date: string
          amount?: number | null
          is_dohan?: boolean
          is_after?: boolean
          cheki_taken?: number
          gifts_received?: Json
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          customer_id?: string
          visit_date?: string
          amount?: number | null
          is_dohan?: boolean
          is_after?: boolean
          cheki_taken?: number
          gifts_received?: Json
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visit_logs_customer_id_fkey'
            columns: ['customer_id']
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
        ]
      }

      conversation_memos: {
        Row: {
          id: string
          user_id: string
          customer_id: string
          memo_date: string
          content: string
          source: ConversationMemoSource
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          customer_id: string
          memo_date?: string
          content: string
          source: ConversationMemoSource
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          customer_id?: string
          memo_date?: string
          content?: string
          source?: ConversationMemoSource
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_memos_customer_id_fkey'
            columns: ['customer_id']
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
        ]
      }

      generation_history: {
        Row: {
          id: string
          user_id: string
          customer_id: string | null
          mode: GenerationMode
          channel: Channel
          input_context: Json
          output_candidates: Json
          final_copied: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          customer_id?: string | null
          mode: GenerationMode
          channel: Channel
          input_context?: Json
          output_candidates?: Json
          final_copied?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          customer_id?: string | null
          mode?: GenerationMode
          channel?: Channel
          input_context?: Json
          output_candidates?: Json
          final_copied?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'generation_history_customer_id_fkey'
            columns: ['customer_id']
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
        ]
      }

      conversation_threads: {
        Row: {
          id: string
          user_id: string
          customer_id: string
          title: string | null
          last_message_at: string | null
          default_length: 'short' | 'medium' | 'long'
          default_affection: number
          default_reply_flow: 'continue' | 'cut'
          default_extra_instructions: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          customer_id: string
          title?: string | null
          last_message_at?: string | null
          default_length?: 'short' | 'medium' | 'long'
          default_affection?: number
          default_reply_flow?: 'continue' | 'cut'
          default_extra_instructions?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          customer_id?: string
          title?: string | null
          last_message_at?: string | null
          default_length?: 'short' | 'medium' | 'long'
          default_affection?: number
          default_reply_flow?: 'continue' | 'cut'
          default_extra_instructions?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_threads_customer_id_fkey'
            columns: ['customer_id']
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
        ]
      }

      conversation_thread_messages: {
        Row: {
          id: string
          thread_id: string
          user_id: string
          direction: 'incoming' | 'outgoing'
          content: string
          source: 'manual' | 'ai_generated' | 'ai_regenerated'
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          user_id: string
          direction: 'incoming' | 'outgoing'
          content: string
          source?: 'manual' | 'ai_generated' | 'ai_regenerated'
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          user_id?: string
          direction?: 'incoming' | 'outgoing'
          content?: string
          source?: 'manual' | 'ai_generated' | 'ai_regenerated'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_thread_messages_thread_id_fkey'
            columns: ['thread_id']
            referencedRelation: 'conversation_threads'
            referencedColumns: ['id']
          },
        ]
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

// テーブル名から Row / Insert / Update を取り出すユーティリティ
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
