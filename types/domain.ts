// =============================================================================
// アプリ内ドメイン型
// db.ts は Supabase の生スキーマ表現 / domain.ts はそれを使う側の意味付き型
// =============================================================================

import type { Tables } from './db'

// ----- リテラル ---------------------------------------
export type Industry =
  | 'concafe'
  | 'menkon'
  | 'kyaba'
  | 'host'
  | 'fuzoku'
  | 'bar_female'
  | 'bar_male'
  | 'other'
/**
 * 業種の安定度。
 *   stable: true  → 動作確認済み(コンカフェのみ)
 *   stable: 未設定 → ベータ。プロンプト調整途中で生成品質が安定していない
 * UI 上は stable=true 以外に「開発中」バッジを出して期待値を下げる。
 * 選択自体は引き続き可能。
 */
export const INDUSTRY_OPTIONS: {
  value: Industry
  label: string
  stable?: boolean
}[] = [
  { value: 'concafe', label: 'コンカフェ', stable: true },
  { value: 'menkon', label: 'メンコン' },
  { value: 'kyaba', label: 'キャバ・ラウンジ' },
  { value: 'bar_female', label: 'バー (女)' },
  { value: 'host', label: 'ホスト' },
  { value: 'bar_male', label: 'バー (男)' },
  { value: 'fuzoku', label: '風俗' },
  { value: 'other', label: 'その他' },
]

export function isStableIndustry(i: Industry | null | undefined): boolean {
  if (!i) return false
  return INDUSTRY_OPTIONS.find((o) => o.value === i)?.stable === true
}

// チャネル = 文体スタイル(媒体ではない)
//   dm     : LINE / X DM / Instagram DM 等の 1on1 チャット全般
//   x_post : X 公開投稿(タイムライン投稿)
//   thanks : お礼/感謝文(来店後・同伴後等)
export type Channel = 'dm' | 'x_post' | 'thanks'
export const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: 'dm', label: 'DM (1on1)' },
  { value: 'x_post', label: 'X 公開投稿' },
  { value: 'thanks', label: 'お礼' },
]

/** 生成モードから使う tone bucket(チャネル) を導出する。 */
export function channelForMode(mode: GenerationMode): Channel {
  if (mode === 'public_post') return 'x_post'
  if (mode === 'thanks') return 'thanks'
  return 'dm'
}

export type SafetyMode = 'safe' | 'normal' | 'loose'
export const SAFETY_MODE_OPTIONS: { value: SafetyMode; label: string; description: string }[] = [
  {
    value: 'safe',
    label: 'セーフモード',
    description: '下ネタや体関係の話題に明確に断る + 代案提示。新人/低リスク向け',
  },
  {
    value: 'normal',
    label: 'ノーマルモード',
    description: '夜職の業界基準。下ネタは普通の会話として自然に受け流す/軽くノる(デフォルト)',
  },
  {
    value: 'loose',
    label: 'スルーモード',
    description: '明確な拒否を避け、関係を断ち切らずやんわり話題転換',
  },
]

export type CustomerType =
  | 'futo'
  | 'ita'
  | 'mame'
  | 'shio'
  | 'oshi_gachi'
  | 'oshi_enjoy'
  | 'other_oshi'
  | 'kake_mochi'
  | 'peer_cast'

/**
 * 推し制度のある業種(コンカフェ/メンコン/ホスト)で意味を持つタイプは
 * oshiSystemOnly フラグを立てる。フォーム側で業種に応じてフィルタする。
 * peer_cast はフラグ無し(全業種で同業者カルテを作りたいニーズがあるため)。
 */
export const CUSTOMER_TYPE_OPTIONS: {
  value: CustomerType
  label: string
  oshiSystemOnly?: boolean
}[] = [
  { value: 'futo', label: '太客' },
  { value: 'ita', label: '痛客' },
  { value: 'mame', label: 'マメ客' },
  { value: 'shio', label: '塩客' },
  { value: 'oshi_gachi', label: '推しガチ勢', oshiSystemOnly: true },
  { value: 'oshi_enjoy', label: '推しエンジョイ勢', oshiSystemOnly: true },
  { value: 'other_oshi', label: '他キャスト推し', oshiSystemOnly: true },
  { value: 'kake_mochi', label: '掛け持ち', oshiSystemOnly: true },
  { value: 'peer_cast', label: '同業キャスト' },
]

/** 推し制度のある業種(コンカフェ/メンコン/ホスト) */
export function isOshiSystemIndustry(i: Industry | null | undefined): boolean {
  return i === 'concafe' || i === 'menkon' || i === 'host'
}

export type GenerationMode =
  | 'general'
  | 'personal'
  | 'reply'
  | 'thanks'
  | 'public_post'

export type ToneSampleSource = 'auto_edited' | 'manual'
export type ConversationMemoSource = 'manual' | 'tool_use_approved'

// ----- お礼モードの「今日の出来事」テンプレ ---------------
// 業種別に頻出シーンを並べてタップ一発で挿入できるようにする。
// chipタップで追記される(複数選択前提)。
export const THANKS_EVENT_TEMPLATES: Record<Industry, string[]> = {
  concafe: [
    'チェキ撮ってくれた',
    'シャンパン入れてくれた',
    '誕生日に来てくれた',
    '久しぶりに来てくれた',
    '毎日来てくれた',
    'グッズ買ってくれた',
    'バック入れてくれた',
    'イベントに来てくれた',
  ],
  menkon: [
    'チェキ撮ってくれた',
    'ドリンク入れてくれた',
    '誕生日に来てくれた',
    '久しぶりに来てくれた',
    '毎日来てくれた',
    'グッズ買ってくれた',
    'バック入れてくれた',
    'イベントに来てくれた',
    '推し変からの再来店',
  ],
  kyaba: [
    '同伴してくれた',
    'アフター行ってくれた',
    'シャンパン入れてくれた',
    '誕生日に来てくれた',
    '久しぶりに来てくれた',
    '本指名してくれた',
    '高い卓してくれた',
  ],
  host: [
    'シャンパン入れてくれた',
    '誕生日に来てくれた',
    '同伴してくれた',
    'アフター行ってくれた',
    'シャンパンタワー入れてくれた',
    '久しぶりに来てくれた',
    '指名してくれた',
  ],
  fuzoku: [
    '指名してくれた',
    'リピートしてくれた',
    'ロングしてくれた',
    'プレゼントくれた',
    '久しぶりに来てくれた',
  ],
  bar_female: [
    '飲みに来てくれた',
    'ボトル入れてくれた',
    '誕生日に来てくれた',
    '久しぶりに来てくれた',
    '同伴してくれた',
    'アフター付き合ってくれた',
    '友達連れてきてくれた',
    '長居してくれた',
  ],
  bar_male: [
    '飲みに来てくれた',
    'ボトル入れてくれた',
    'おすすめのカクテル飲んでくれた',
    '誕生日に来てくれた',
    '久しぶりに来てくれた',
    '友達連れてきてくれた',
    '一見で来てくれた',
  ],
  other: [
    '来店してくれた',
    '誕生日に来てくれた',
    '久しぶりに来てくれた',
    'プレゼントくれた',
    '毎日来てくれた',
  ],
}

// ----- 個人営業モードの「営業したい内容」テンプレ -----------------
// chip タップで sceneType に追記される。
export const SALES_INTENT_TEMPLATES: Record<Industry, string[]> = {
  concafe: [
    '久しぶりに会いたい',
    '今度イベントあるよ',
    '出勤するから来てほしい',
    '誕生日近いから来てほしい',
    '新衣装着る',
    '周年に来てほしい',
    'チェキ撮ろう',
  ],
  menkon: [
    '久しぶりに会いたい',
    '今度イベントあるよ',
    '出勤するから来てほしい',
    '誕生日近いから来てほしい',
    '周年に来てほしい',
    'チェキ撮ろう',
    '推し変キャンペーン',
  ],
  kyaba: [
    '久しぶりに会いたい',
    '今度イベントあるよ',
    '出勤するから来てほしい',
    '誕生日近いから来てほしい',
    '同伴お願いしたい',
    'アフター行きたい',
    'シャンパン入れてほしい',
  ],
  host: [
    '久しぶりに会いたい',
    '今度イベントあるよ',
    '出勤するから来てほしい',
    '誕生日近いから来てほしい',
    '同伴お願いしたい',
    'シャンパン入れてほしい',
    '指名取りたい',
  ],
  bar_female: [
    '久しぶりに会いたい',
    '今度イベントあるよ',
    '出勤するから来てほしい',
    '誕生日近いから来てほしい',
    '新作カクテルあるよ',
  ],
  bar_male: [
    '久しぶりに会いたい',
    '今度イベントあるよ',
    '出勤するから来てほしい',
    '新作カクテルあるよ',
    '新しいウイスキー入った',
  ],
  fuzoku: [
    '久しぶりに会いたい',
    '出勤するから来てほしい',
    '誕生日近いから来てほしい',
    '写メ日記更新した',
  ],
  other: [
    '久しぶりに会いたい',
    '今度イベントあるよ',
    '出勤するから来てほしい',
    '誕生日近いから来てほしい',
  ],
}

// ----- 公開投稿(X 等)のテンプレ ---------------------------
// chip タップで sceneType に追記される。
export const PUBLIC_POST_TEMPLATES: Record<Industry, string[]> = {
  concafe: [
    '出勤告知',
    'チェキ会告知',
    '新衣装お披露目',
    '周年告知',
    'イベント告知',
    'グッズ販売告知',
    '今日の感謝',
    '日常の呟き',
  ],
  menkon: [
    '出勤告知',
    'チェキ会告知',
    '周年告知',
    'イベント告知',
    'グッズ販売告知',
    '今日の感謝',
    '日常の呟き',
  ],
  kyaba: [
    '出勤告知',
    '同伴募集',
    'イベント告知',
    '誕生日告知',
    '今日の感謝',
  ],
  host: [
    '出勤告知',
    'シャンパン入れてもらった',
    'イベント告知',
    '誕生日告知',
    '今日の感謝',
  ],
  bar_female: [
    '出勤告知',
    '新作カクテル告知',
    'イベント告知',
    '今日の感謝',
  ],
  bar_male: [
    '出勤告知',
    '新作カクテル告知',
    '新しいウイスキー入荷',
    'イベント告知',
    '今日の感謝',
  ],
  fuzoku: [
    '出勤告知',
    '写メ日記更新告知',
    'イベント告知',
  ],
  other: ['出勤告知', 'イベント告知', '今日の感謝'],
}

// ----- X 公開投稿のハッシュタグ提案 -----------------------
// chip タップでローカル(Pinia)のハッシュタグリストに追加される。
// 生成 API には影響せず、生成後の本文末尾に付与するだけ。
export const HASHTAG_SUGGESTIONS: Record<Industry, string[]> = {
  concafe: [
    'コンカフェ',
    'コンカフェ嬢',
    'メイドカフェ',
    '出勤情報',
    '推し活',
    'ヲタクと繋がりたい',
  ],
  menkon: [
    'メンコン',
    'メンズコンカフェ',
    '執事カフェ',
    '出勤情報',
    '推し活',
  ],
  kyaba: ['キャバ嬢', '出勤情報', '夜職', 'ラウンジ嬢', '同伴募集'],
  host: ['ホスト', '出勤情報', '夜職'],
  bar_female: ['ガールズバー', 'バー', '出勤情報', '夜職'],
  bar_male: ['オーセンティックバー', 'バーテンダー', '出勤情報'],
  fuzoku: ['出勤情報', '写メ日記'],
  other: ['出勤情報'],
}

/** 新規ユーザーのハッシュタグ初期値(クライアントハードコード) */
export const DEFAULT_HASHTAGS: string[] = ['コンカフェ']

// ----- DB Row エイリアス -----------------------------
export type UserProfile = Tables<'user_profile'>
export type ToneSample = Tables<'tone_samples'>
export type Customer = Tables<'customers'>
export type VisitLog = Tables<'visit_logs'>
export type ConversationMemo = Tables<'conversation_memos'>
export type GenerationHistory = Tables<'generation_history'>
export type ConversationThread = Tables<'conversation_threads'>
export type ConversationThreadMessage = Tables<'conversation_thread_messages'>

// ----- スレッドメッセージ -----------------------------
export type MessageDirection = 'incoming' | 'outgoing'
export type MessageSource = 'manual' | 'ai_generated' | 'ai_regenerated'

// ----- preferences の中身 ---------------------------
// customers.preferences は jsonb。アプリ側で扱う型を固定する。
export interface CustomerPreferences {
  smoking?: boolean | null
  alcohol?: string | null
  champagne?: string | null
  food?: string | null
  others?: string | null
}

// ----- tone_features の中身 ----------------------------
// tone_features は /api/tone/analyze が書き出す。3 層構造 (PROMPTS.md [10-A])。
// チャネル単位の wrapper はレガシー互換のため残置 (実際には 'dm' キーのみ使用)。
export interface ToneFeatures {
  byChannel?: Partial<Record<Channel, ToneFeatureSet>>
  updatedAt?: string
}

/** 層1: 構造的特徴 (PROMPTS.md [5-2]) */
export interface StructuralFeatures {
  avgLength: number
  avgSentencePerMessage: number
  emojiDensity: 'low' | 'medium' | 'high'
  emojiDensityNote: string
  lineBreakStyle: 'minimal' | 'moderate' | 'frequent'
  frequentEndings: string[]
  frequentEmojis: string[]
  frequentPunctuation: string[]
  firstPerson: string
}

/** 層2: 方言・キャラ判定 (PROMPTS.md [5-3]) */
export interface JudgedFeatures {
  dialect: 'standard' | 'kansai' | 'hakata' | 'okinawa' | 'mixed' | 'unknown'
  dialectIntensity: 'none' | 'light' | 'moderate' | 'heavy'
  dialectExamples: string[]
  characterStyle:
    | 'sweet'
    | 'cool'
    | 'big_sister'
    | 'natural'
    | 'gal'
    | 'mature'
    | 'other'
  characterStyleNote: string
  speechBase: 'polite' | 'casual' | 'mixed'
  callPattern: string
  characteristicPhrases: string[]
}

/** 層3: Few-shot サンプル (PROMPTS.md [5-4]) */
export interface ExampleSample {
  text: string
  contextLabel: string
  channel: string
  characteristicReason: string
}

/**
 * 1 ユーザー (= 1 channel='dm') の口調学習結果。
 * Opus 4.7 が `/api/tone/analyze` で抽出したものをそのまま保存する。
 */
export interface ToneFeatureSet {
  structuralFeatures: StructuralFeatures
  judgedFeatures: JudgedFeatures
  exampleSamples: ExampleSample[]
  lastAnalyzedAt: string
  /** 分析時のサンプル件数 (UI 表示用、PROMPTS.md スキーマ外) */
  sampleCount?: number
}

// ----- 生成API I/O ------------------------------------
export type ReplyFlow = 'continue' | 'cut'

export interface GenerateRequest {
  mode: GenerationMode
  channel: Channel
  sceneType?: string
  customerId?: string
  /**
   * 未登録の客に対する簡易ターゲット。personal / reply / thanks モードで
   * customerId 未指定時のフォールバック。プロンプトには名前のみが渡る。
   */
  customerName?: string
  incomingMessage?: string
  todayEvent?: string
  lengthPreference?: 'short' | 'medium' | 'long'
  /** 愛情度 1〜10 (1=塩、10=愛情)。省略時は中間扱い */
  affectionLevel?: number
  /**
   * 返信モード時の会話の流れ:
   *   continue: 次の話題に繋げる(デフォルト)
   *   cut: 自然に区切って終わらせる
   */
  replyFlow?: ReplyFlow
  /** 追加で含めたい内容(任意指示)。返信モードで使う想定。最大 500 字 */
  extraInstructions?: string
}

export interface ToolCallProposal {
  type: 'propose_customer_create' | 'propose_customer_update'
  toolUseId: string
  input: {
    customer_id?: string
    nickname?: string
    preferences?: CustomerPreferences
    occupation?: string
    memo?: string
    ng_time?: string
    // コンカフェ拡張
    cheki_count?: number
    oshi_rank?: string
    goods_owned?: string[]
  }
}

export interface GenerateResponse {
  candidates: [string, string, string]
  toolCalls?: ToolCallProposal[]
  historyId?: string
}
