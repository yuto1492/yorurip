import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Database, Json } from '~/types/db'
import type {
  Channel,
  ToneFeatures,
  ToneFeatureSet,
} from '~/types/domain'
import { consumeCooldown } from '~/server/utils/rate-limit'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import {
  TONE_ANALYSIS_FEW_SHOT_OUTPUT,
  TONE_ANALYSIS_FEW_SHOT_USER_PROMPT,
  TONE_ANALYSIS_SYSTEM_PROMPT,
  buildToneAnalysisUserPrompt,
} from '~/server/utils/prompts/tone_analysis'

const VALID_CHANNELS: Channel[] = ['dm', 'x_post', 'thanks']
// クライアント側で 1 ユーザー / 1 チャネル の口調サンプルを 5 件で頭打ちにしている。
// レガシーの自動収集データが大量に残っているケースでも、最新 5 件のみで分析する。
const SAMPLE_LIMIT = 5
const MIN_SAMPLES = 5
// 連打防止のため (userId, channel) ごとに 60 秒のクールダウンを設ける。
const ANALYZE_COOLDOWN_MS = 60_000

// =============================================================================
// 分析ティア設定: コスト/品質のトレードオフ
//   - standard: 通常ユーザー向け。Haiku 4.5 + リトライ1回。1回あたり約 2〜4 円
//   - premium:  将来の VIP/Pro ユーザー向け。Opus 4.7 + リトライ2回。1回あたり約 8〜30 円
// 現状は全ユーザー standard。将来 user_profile に tier カラムを足したらここで分岐する。
// =============================================================================
type ToneAnalysisTier = 'standard' | 'premium'

interface TierConfig {
  model: string
  maxRetries: number
  maxTokens: number
}

const TIER_CONFIG: Record<ToneAnalysisTier, TierConfig> = {
  standard: {
    model: 'claude-haiku-4-5',
    maxRetries: 1,
    maxTokens: 4000,
  },
  premium: {
    model: 'claude-opus-4-7',
    maxRetries: 2,
    maxTokens: 4000,
  },
}

const DEFAULT_TIER: ToneAnalysisTier = 'standard'

// =============================================================================
// Zod スキーマ (PROMPTS.md [10-A] に厳密準拠)
// 必須フィールド欠落 / 配列空 → ValidationError → 再試行
// =============================================================================

const StructuralFeaturesSchema = z.object({
  avgLength: z.number().int().nonnegative(),
  avgSentencePerMessage: z.number().nonnegative(),
  emojiDensity: z.enum(['low', 'medium', 'high']),
  emojiDensityNote: z.string().min(1),
  lineBreakStyle: z.enum(['minimal', 'moderate', 'frequent']),
  frequentEndings: z.array(z.string().min(1)).min(3, '語尾を3個以上'),
  frequentEmojis: z.array(z.string().min(1)).min(1, '絵文字配列に少なくとも 1 件'),
  frequentPunctuation: z.array(z.string()).min(1),
  firstPerson: z.string().min(1),
})

const JudgedFeaturesSchema = z.object({
  dialect: z.enum([
    'standard',
    'kansai',
    'hakata',
    'okinawa',
    'mixed',
    'unknown',
  ]),
  dialectIntensity: z.enum(['none', 'light', 'moderate', 'heavy']),
  dialectExamples: z.array(z.string()),
  characterStyle: z.enum([
    'sweet',
    'cool',
    'big_sister',
    'natural',
    'gal',
    'mature',
    'other',
  ]),
  characterStyleNote: z.string().min(1),
  speechBase: z.enum(['polite', 'casual', 'mixed']),
  callPattern: z.string().min(1),
  characteristicPhrases: z
    .array(z.string().min(1))
    .min(3, '個性的な癖を3個以上 必須'),
})

const ExampleSampleSchema = z.object({
  text: z.string().min(1),
  contextLabel: z.string().min(1),
  channel: z.string().min(1),
  characteristicReason: z.string().min(1),
})

const ToneAnalysisSchema = z.object({
  structuralFeatures: StructuralFeaturesSchema,
  judgedFeatures: JudgedFeaturesSchema,
  exampleSamples: z
    .array(ExampleSampleSchema)
    .min(3, 'Few-shot サンプルを 3 本以上 必須')
    .max(5),
  lastAnalyzedAt: z.string().min(1),
})

interface AnalyzeRequest {
  channel: Channel
}

interface AnalyzeResponse {
  ok: boolean
  features?: ToneFeatureSet
  sampleCount: number
  reason?: string
}

export default defineEventHandler(async (event): Promise<AnalyzeResponse> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const body = await readBody<Partial<AnalyzeRequest>>(event)
  if (!body?.channel || !VALID_CHANNELS.includes(body.channel))
    throw createError({ statusCode: 400, statusMessage: 'invalid channel' })

  // クールダウン (チャネル別)。連打したら 429 で弾く。
  const cd = consumeCooldown(`tone:${user.id}:${body.channel}`, ANALYZE_COOLDOWN_MS)
  if (!cd.ok) {
    setHeader(event, 'Retry-After', cd.retryAfterSec)
    throw createError({
      statusCode: 429,
      statusMessage: `口調分析は ${ANALYZE_COOLDOWN_MS / 1000} 秒に 1 回までです。あと ${cd.retryAfterSec} 秒お待ちください。`,
    })
  }

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const { data: samples, error: samplesErr } = await supabase
    .from('tone_samples')
    .select('content, channel, source')
    .eq('user_id', user.id)
    .eq('channel', body.channel)
    .order('created_at', { ascending: false })
    .limit(SAMPLE_LIMIT)
  if (samplesErr)
    throw createError({ statusCode: 500, statusMessage: samplesErr.message })

  const sampleCount = samples?.length ?? 0
  if (sampleCount < MIN_SAMPLES) {
    return { ok: false, sampleCount, reason: 'not enough samples' }
  }

  const config = useRuntimeConfig(event)
  const apiKey = config.anthropicApiKey as string
  if (!apiKey)
    throw createError({ statusCode: 500, statusMessage: 'anthropic api key not configured' })

  // --- ユーザープロフィール (industry を取得して prompt に注入) -------------
  const { data: profileRow, error: profileErr } = await supabase
    .from('user_profile')
    .select('industry, tone_features')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileErr)
    throw createError({ statusCode: 500, statusMessage: profileErr.message })
  const industry = profileRow?.industry ?? 'concafe'

  // --- ユーザープロンプト構築 -----------------------------------------------
  const channelDist = new Map<string, number>()
  for (const s of samples!) {
    const ch = (s as { channel?: string }).channel ?? 'dm'
    channelDist.set(ch, (channelDist.get(ch) ?? 0) + 1)
  }
  const userPrompt = buildToneAnalysisUserPrompt({
    industry,
    channelDistribution: Array.from(channelDist.entries())
      .map(([ch, n]) => `${ch}: ${n}`)
      .join(', '),
    samples: samples!.map((s) => ({
      channel: (s as { channel?: string }).channel ?? 'dm',
      source: (s as { source?: string }).source ?? 'manual',
      content: s.content as string,
    })),
  })

  // --- ティア毎のモデルで抽出。失敗時は maxRetries 回まで再試行。 ----------
  // 将来的に VIP ユーザーは tier='premium' (Opus 4.7) に切替可能。
  const tier: ToneAnalysisTier = DEFAULT_TIER
  const tierConfig = TIER_CONFIG[tier]
  const anthropic = new Anthropic({ apiKey })
  const parsed = await analyzeWithRetry(anthropic, userPrompt, tierConfig)
  if (!parsed) {
    throw createError({
      statusCode: 502,
      statusMessage:
        '口調分析に失敗しました (バリデーション失敗が連続)。サンプルを増やして再度お試しください。',
    })
  }

  // --- 3 層構造のままを保存 (sampleCount は UI 表示用の補助) --------------
  const featureSet: ToneFeatureSet = {
    structuralFeatures: parsed.structuralFeatures,
    judgedFeatures: parsed.judgedFeatures,
    exampleSamples: parsed.exampleSamples,
    lastAnalyzedAt: parsed.lastAnalyzedAt || new Date().toISOString(),
    sampleCount,
  }

  // 既存の簡易構造の tone_features は破棄。byChannel.dm のみを置き換え、
  // updatedAt も上書きして 3 層構造を新規保存する。
  const next: ToneFeatures = {
    byChannel: {
      [body.channel]: featureSet,
    },
    updatedAt: featureSet.lastAnalyzedAt,
  }

  const { error: updateErr } = await supabase
    .from('user_profile')
    .update({ tone_features: next as unknown as Json })
    .eq('user_id', user.id)
  if (updateErr)
    throw createError({ statusCode: 500, statusMessage: updateErr.message })

  return { ok: true, features: featureSet, sampleCount }
})

// =============================================================================
// Anthropic 呼び出し + Zod バリデーション + リトライ
// =============================================================================

type ParsedAnalysis = z.infer<typeof ToneAnalysisSchema>

async function analyzeWithRetry(
  anthropic: Anthropic,
  userPrompt: string,
  tierConfig: TierConfig,
): Promise<ParsedAnalysis | null> {
  for (let attempt = 0; attempt <= tierConfig.maxRetries; attempt++) {
    // Prompt cache 戦略:
    //   system プロンプト + Few-shot (user input → assistant output) は
    //   全ユーザー共通かつ完全に固定なので、breakpoint を 2 箇所置く:
    //     1. system 末尾 → tools + system 全体をキャッシュ
    //     2. Few-shot assistant 末尾 → Few-shot ペアまでキャッシュ
    //   これにより 1 ユーザー内の連続呼び出しだけでなく、
    //   異なるユーザー間でも (内容が同じなので) cache hit する。
    //   口調分析は背景発火 + 60 秒クールダウンなので Few-shot 部分の cache が
    //   特に効きやすい (5 分以内に複数ユーザー / 同一ユーザーから叩かれる想定)。
    const response = await anthropic.messages.create({
      model: tierConfig.model,
      max_tokens: tierConfig.maxTokens,
      system: [
        {
          type: 'text',
          text: TONE_ANALYSIS_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        // Few-shot: 入力 → 期待出力 のペア
        { role: 'user', content: TONE_ANALYSIS_FEW_SHOT_USER_PROMPT },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: TONE_ANALYSIS_FEW_SHOT_OUTPUT,
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
        // 本番のリクエスト
        // 注: Opus 4.7 は assistant prefill 非対応のため、system プロンプト末尾の
        // 「JSON 1 つのみ・前置きなし」指示と Few-shot で出力形式を担保する
        { role: 'user', content: userPrompt },
      ],
    })

    // Prompt cache 利用状況をログ
    const usage = response.usage as Anthropic.Usage & {
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    console.info('[tone analyze] attempt', attempt + 1, 'usage', {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
    })

    // assistant の応答を結合
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const cleaned = stripJsonFences(text).trim()

    let raw: unknown
    try {
      raw = JSON.parse(cleaned)
    } catch (e) {
      console.warn(
        `[tone analyze] attempt ${attempt + 1}: JSON parse failed`,
        (e as Error).message,
        cleaned.slice(0, 200),
      )
      continue
    }

    const result = ToneAnalysisSchema.safeParse(raw)
    if (result.success) {
      return result.data
    }
    console.warn(
      `[tone analyze] attempt ${attempt + 1}: schema validation failed`,
      result.error.issues.slice(0, 5),
    )
  }
  return null
}

/**
 * モデル出力からJSONオブジェクトを取り出す。
 * - ```json ... ``` フェンスがあれば中身を取る
 * - 前置き等が混じっても最初の `{` から最後の `}` までを抽出
 */
function stripJsonFences(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced && fenced[1]) return fenced[1]
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) return s.slice(first, last + 1)
  return s
}
