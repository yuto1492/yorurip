import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'
import type {
  ConversationThread,
  ConversationThreadMessage,
  Customer,
  GenerateRequest,
  GenerateResponse,
  ReplyFlow,
  ToneSample,
  UserProfile,
} from '~/types/domain'
import { consumeRate } from '~/server/utils/rate-limit'
import { generate as generateWithClaude } from '~/server/utils/claude'

const THREAD_CONTEXT_LIMIT = 12 // プロンプトに含める直近メッセージ件数
const TONE_SAMPLE_LIMIT = 5

interface GenerateBody {
  /** プロンプト時に最後の incoming として扱う任意テキスト(まだ DB 未保存) */
  incomingMessage?: string
  /** スレッドのデフォルト設定を上書きしたい場合のみ */
  lengthPreference?: 'short' | 'medium' | 'long'
  affectionLevel?: number
  replyFlow?: ReplyFlow
  extraInstructions?: string
}

/**
 * POST /api/threads/:id/generate
 *
 * スレッド全体を読んで Claude に「次の outgoing」3 候補を生成させる。
 * - 客カルテ + 直近メッセージ + ユーザー口調 をプロンプトに注入
 * - 設定はリクエスト指定優先 → スレッドデフォルト → グローバルデフォルト
 *
 * 呼び出し元 UI のフロー:
 *   1. ユーザーが客から来た文面(incomingMessage)を入力
 *   2. 「返信を生成」→ /messages POST で incoming を保存 → /generate を呼ぶ
 *   3. 3 候補が返るのでユーザーが採用 → /messages POST で outgoing 保存
 */
export default defineEventHandler(
  async (event): Promise<GenerateResponse> => {
    const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    // レート制限(/api/generate と同じバケット)
    const rate = consumeRate(user.id)
    if (!rate.ok) {
      setHeader(event, 'Retry-After', rate.retryAfterSec)
      throw createError({
        statusCode: 429,
        statusMessage: `rate limit exceeded (retry in ${rate.retryAfterSec}s)`,
      })
    }

    const threadId = getRouterParam(event, 'id')
    if (!threadId)
      throw createError({ statusCode: 400, statusMessage: 'thread id required' })

    const body = await readBody<Partial<GenerateBody>>(event)
    const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    // ---- スレッド & 客 & プロファイル ロード ----
    const { data: thread, error: tErr } = await supabase
      .from('conversation_threads')
      .select('*')
      .eq('id', threadId)
      .maybeSingle()
    if (tErr) throw createError({ statusCode: 500, statusMessage: tErr.message })
    if (!thread)
      throw createError({ statusCode: 404, statusMessage: 'thread not found' })

    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', thread.customer_id)
      .maybeSingle()
    if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
    if (!customer)
      throw createError({ statusCode: 404, statusMessage: 'customer not found' })

    const { data: profileRow, error: pErr } = await supabase
      .from('user_profile')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (pErr) throw createError({ statusCode: 500, statusMessage: pErr.message })
    if (!profileRow)
      throw createError({ statusCode: 400, statusMessage: 'profile not set' })

    // ---- スレッド履歴 ロード(直近 N 件、時系列昇順) ----
    const { data: msgsDesc, error: mErr } = await supabase
      .from('conversation_thread_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(THREAD_CONTEXT_LIMIT)
    if (mErr) throw createError({ statusCode: 500, statusMessage: mErr.message })
    const threadMessages = ((msgsDesc ?? []) as ConversationThreadMessage[])
      .slice()
      .reverse() // 古→新

    // ---- 口調サンプル(チャネル: 'dm' 固定。スレッド = 1on1 想定) ----
    const { data: toneRows, error: toneErr } = await supabase
      .from('tone_samples')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel', 'dm')
      .order('created_at', { ascending: false })
      .limit(TONE_SAMPLE_LIMIT)
    if (toneErr)
      throw createError({ statusCode: 500, statusMessage: toneErr.message })
    const toneSamples = (toneRows ?? []) as ToneSample[]

    // ---- 設定: body 指定 > thread デフォルト > グローバル ----
    const lengthPreference =
      body?.lengthPreference === 'short' ||
      body?.lengthPreference === 'medium' ||
      body?.lengthPreference === 'long'
        ? body.lengthPreference
        : (thread.default_length as 'short' | 'medium' | 'long')

    const affectionLevel =
      typeof body?.affectionLevel === 'number'
        ? Math.max(1, Math.min(10, Math.round(body.affectionLevel)))
        : thread.default_affection

    const replyFlow: ReplyFlow =
      body?.replyFlow === 'cut' || body?.replyFlow === 'continue'
        ? body.replyFlow
        : (thread.default_reply_flow as ReplyFlow)

    const extraInstructions =
      typeof body?.extraInstructions === 'string'
        ? body.extraInstructions.trim().slice(0, 500) || undefined
        : thread.default_extra_instructions ?? undefined

    // ---- リクエスト構築 ----
    const request: GenerateRequest = {
      mode: 'reply',
      channel: 'dm',
      customerId: thread.customer_id,
      incomingMessage:
        typeof body?.incomingMessage === 'string'
          ? body.incomingMessage.trim() || undefined
          : undefined,
      lengthPreference,
      affectionLevel,
      replyFlow,
      extraInstructions,
    }

    const promptCtx = {
      profile: profileRow as UserProfile,
      request,
      customer: customer as Customer,
      customerNameOverride: null,
      recentMemos: [], // スレッド履歴で十分。memos は注入しない
      toneSamples,
      threadMessages,
    }

    const config = useRuntimeConfig(event)
    if (!config.anthropicApiKey)
      throw createError({
        statusCode: 500,
        statusMessage: 'anthropic api key not configured',
      })
    const result = await generateWithClaude(promptCtx, {
      apiKey: config.anthropicApiKey as string,
    })

    return {
      candidates: result.candidates,
      toolCalls: result.toolCalls,
    }
  },
)
