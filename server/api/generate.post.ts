import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Json } from '~/types/db'
import type {
  Channel,
  ConversationMemo,
  Customer,
  GenerateRequest,
  GenerateResponse,
  GenerationMode,
  ReplyFlow,
  ToneSample,
  UserProfile,
} from '~/types/domain'
import { consumeRate } from '~/server/utils/rate-limit'
import { generate as generateWithClaude } from '~/server/utils/claude'

const VALID_MODES: GenerationMode[] = [
  'general',
  'personal',
  'reply',
  'thanks',
  'public_post',
]
const VALID_CHANNELS: Channel[] = ['dm', 'x_post', 'thanks']
const VALID_LENGTH = ['short', 'medium', 'long'] as const
const TONE_SAMPLE_LIMIT = 5
const RECENT_MEMO_LIMIT = 3

export default defineEventHandler(async (event): Promise<GenerateResponse> => {
  // ---- 1. Auth ----------------------------------------------------------
  const user = await getAuthUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  // ---- 2. Rate limit ----------------------------------------------------
  const rate = consumeRate(user.id)
  if (!rate.ok) {
    setHeader(event, 'Retry-After', rate.retryAfterSec)
    throw createError({
      statusCode: 429,
      statusMessage: `rate limit exceeded (retry in ${rate.retryAfterSec}s)`,
    })
  }

  // ---- 3. Body parse / validate ----------------------------------------
  const body = await readBody<Partial<GenerateRequest>>(event)
  const request = parseRequest(body)

  // ---- 4. Load context from DB -----------------------------------------
  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const { data: profileRow, error: profileErr } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileErr) throw createError({ statusCode: 500, statusMessage: profileErr.message })
  if (!profileRow) {
    throw createError({
      statusCode: 400,
      statusMessage: 'profile not set; complete onboarding first',
    })
  }
  const profile = profileRow as UserProfile

  // 客指定の必要性:
  //   personal / reply / thanks → customerId か customerName のどちらかが必要
  //   未登録の客にも気軽に生成できるよう名前のみのフォールバックを許容する
  let customer: Customer | null = null
  let customerNameOverride: string | null = null
  let recentMemos: ConversationMemo[] = []

  if (
    request.mode === 'personal' ||
    request.mode === 'reply' ||
    request.mode === 'thanks'
  ) {
    if (!request.customerId && !request.customerName) {
      throw createError({
        statusCode: 400,
        statusMessage: `mode=${request.mode} requires customerId or customerName`,
      })
    }
  }

  if (request.customerId) {
    const { data: customerRow, error: customerErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', request.customerId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (customerErr)
      throw createError({ statusCode: 500, statusMessage: customerErr.message })
    if (!customerRow) {
      throw createError({ statusCode: 404, statusMessage: 'customer not found' })
    }
    customer = customerRow as Customer

    const { data: memoRows, error: memoErr } = await supabase
      .from('conversation_memos')
      .select('*')
      .eq('customer_id', customer.id)
      .order('memo_date', { ascending: false })
      .limit(RECENT_MEMO_LIMIT)
    if (memoErr) throw createError({ statusCode: 500, statusMessage: memoErr.message })
    recentMemos = (memoRows ?? []) as ConversationMemo[]
  } else if (request.customerName) {
    customerNameOverride = request.customerName.slice(0, 80)
  }

  // 返信は相手文面、お礼は今日の出来事が必要
  if (request.mode === 'reply' && !request.incomingMessage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'mode=reply requires incomingMessage',
    })
  }
  if (request.mode === 'thanks' && !request.todayEvent) {
    throw createError({
      statusCode: 400,
      statusMessage: 'mode=thanks requires todayEvent',
    })
  }

  // 口調サンプル: 学習バケットは 'dm' に統一されているため、生成モード/チャネルに
  // 関わらず常に 'dm' を参照する。
  const { data: toneRows, error: toneErr } = await supabase
    .from('tone_samples')
    .select('*')
    .eq('user_id', user.id)
    .eq('channel', 'dm')
    .order('created_at', { ascending: false })
    .limit(TONE_SAMPLE_LIMIT)
  if (toneErr) throw createError({ statusCode: 500, statusMessage: toneErr.message })
  const toneSamples = (toneRows ?? []) as ToneSample[]

  // ---- 5. LLM 呼び出し --------------------------------------------------
  const config = useRuntimeConfig(event)
  if (!config.anthropicApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'anthropic api key not configured',
    })
  }
  const promptCtx = {
    profile,
    request,
    customer,
    customerNameOverride,
    recentMemos,
    toneSamples,
  }
  const result = await generateWithClaude(promptCtx, {
    apiKey: config.anthropicApiKey as string,
  })

  // ---- 6. 履歴保存 ------------------------------------------------------
  const { data: historyRow, error: historyErr } = await supabase
    .from('generation_history')
    .insert({
      user_id: user.id,
      customer_id: customer?.id ?? null,
      mode: request.mode,
      channel: request.channel,
      input_context: request as unknown as Json,
      output_candidates: result.candidates as unknown as Json,
    })
    .select('id')
    .single()
  if (historyErr) {
    // 履歴保存失敗は致命ではない。ログだけ残して結果は返す。
    console.warn('[generate] history insert failed:', historyErr.message)
  }

  return {
    candidates: result.candidates,
    toolCalls: result.toolCalls,
    historyId: historyRow?.id,
  }
})

// =============================================================================
// helpers
// =============================================================================

function parseRequest(raw: Partial<GenerateRequest> | null | undefined): GenerateRequest {
  if (!raw || typeof raw !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'invalid request body' })
  }

  if (!raw.mode || !VALID_MODES.includes(raw.mode)) {
    throw createError({
      statusCode: 400,
      statusMessage: `invalid mode (must be one of: ${VALID_MODES.join(', ')})`,
    })
  }
  if (!raw.channel || !VALID_CHANNELS.includes(raw.channel)) {
    throw createError({
      statusCode: 400,
      statusMessage: `invalid channel (must be one of: ${VALID_CHANNELS.join(', ')})`,
    })
  }

  const lengthPref =
    raw.lengthPreference && VALID_LENGTH.includes(raw.lengthPreference)
      ? raw.lengthPreference
      : undefined

  let affection: number | undefined
  if (typeof raw.affectionLevel === 'number' && Number.isFinite(raw.affectionLevel)) {
    affection = Math.max(1, Math.min(10, Math.round(raw.affectionLevel)))
  }

  const replyFlow: ReplyFlow | undefined =
    raw.replyFlow === 'cut' || raw.replyFlow === 'continue'
      ? raw.replyFlow
      : undefined

  const extraInstructions =
    typeof raw.extraInstructions === 'string'
      ? raw.extraInstructions.trim().slice(0, 500) || undefined
      : undefined

  return {
    mode: raw.mode,
    channel: raw.channel,
    sceneType: typeof raw.sceneType === 'string' ? raw.sceneType.slice(0, 200) : undefined,
    customerId: typeof raw.customerId === 'string' ? raw.customerId : undefined,
    customerName:
      typeof raw.customerName === 'string'
        ? raw.customerName.trim().slice(0, 80) || undefined
        : undefined,
    incomingMessage:
      typeof raw.incomingMessage === 'string'
        ? raw.incomingMessage.slice(0, 2000)
        : undefined,
    todayEvent:
      typeof raw.todayEvent === 'string' ? raw.todayEvent.slice(0, 1000) : undefined,
    lengthPreference: lengthPref,
    affectionLevel: affection,
    replyFlow,
    extraInstructions,
  }
}
