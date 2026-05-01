import Anthropic from '@anthropic-ai/sdk'
import type { ToolCallProposal } from '~/types/domain'
import { TOOLS } from './prompts/tools'
import { composeSystemPrompt, composeUserPrompt, type PromptContext } from './prompts/index'

/**
 * モデル選択。CLAUDE.md の方針に従い MVP は Haiku 4.5 主体。
 * Sonnet 4.6 は将来Pro契約者向けに切替予定 → ENV 経由で上書き可能にしておく。
 */
const DEFAULT_MODEL = 'claude-haiku-4-5'

export interface GenerateResult {
  candidates: [string, string, string]
  toolCalls: ToolCallProposal[]
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

let client: Anthropic | null = null

function getClient(apiKey: string): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey })
  }
  return client
}

/**
 * 生成本体。Tool Useで構造化出力する設計:
 *  - submit_candidates: 必須(tool_choice: any + プロンプト指示で実質強制)
 *  - propose_customer_*: 任意。会話から抽出できれば追加で呼ばれる。
 */
export async function generate(
  ctx: PromptContext,
  options: { apiKey: string; model?: string },
): Promise<GenerateResult> {
  const anthropic = getClient(options.apiKey)
  const system = composeSystemPrompt(ctx)
  const userPrompt = composeUserPrompt(ctx)

  let response
  try {
    response = await anthropic.messages.create({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: 1024,
      // Prompt cache breakpoint:
      //   system プロンプト (業種ペルソナ + チャネルガイド + 安全モード + 出力規則) は
      //   ユーザーの profile + mode + channel が同じなら同一文字列なので 5 分以内の
      //   後続呼び出しで cache hit (入力トークン 90% 引き) する。
      //   tools は system より前にレンダーされるので、ここに breakpoint を置けば
      //   tools + system が一括キャッシュされる。
      //   user メッセージは customer / scene / 口調が毎回変わるのでキャッシュしない。
      system: [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
      tools: TOOLS,
      tool_choice: { type: 'any' },
    })
  } catch (e) {
    throw mapAnthropicError(e)
  }

  let candidates: string[] = []
  const toolCalls: ToolCallProposal[] = []

  for (const block of response.content) {
    if (block.type !== 'tool_use') continue

    if (block.name === 'submit_candidates') {
      const input = block.input as { candidates?: unknown }
      if (Array.isArray(input.candidates)) {
        candidates = input.candidates.filter(
          (c): c is string => typeof c === 'string' && c.trim().length > 0,
        )
      }
      continue
    }

    if (block.name === 'propose_customer_create' || block.name === 'propose_customer_update') {
      toolCalls.push({
        type: block.name,
        toolUseId: block.id,
        input: block.input as ToolCallProposal['input'],
      })
    }
  }

  if (candidates.length === 0) {
    throw createError({
      statusCode: 502,
      statusMessage: 'model did not return candidates',
    })
  }

  // 3案保証: 足りなければ最後の案で水増し(モデルが2しか返さなかった等の保険)
  while (candidates.length < 3) candidates.push(candidates[candidates.length - 1] ?? '')
  const triple: [string, string, string] = [candidates[0], candidates[1], candidates[2]]

  // Prompt cache 利用状況をログに出す (cache_read_input_tokens > 0 ならヒット)
  const usage = response.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  console.info('[claude generate] usage', {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
  })

  return {
    candidates: triple,
    toolCalls,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  }
}

/**
 * Anthropic SDK が投げる typed error を h3 のエラーに変換する。
 * 残高不足/レート制限/認証等を分けて、UIに表示しやすい日本語メッセージにする。
 */
function mapAnthropicError(e: unknown): Error {
  if (e instanceof Anthropic.APIError) {
    // 生のエラー詳細を dev コンソールに出して原因切り分けしやすくする
    console.error('[claude] APIError', {
      status: e.status,
      requestId: (e as { request_id?: string }).request_id,
      message: e.message,
    })
  }

  if (e instanceof Anthropic.AuthenticationError) {
    return createError({
      statusCode: 500,
      statusMessage:
        'Anthropic APIキーが無効か期限切れです。サーバの NUXT_ANTHROPIC_API_KEY を見直してください。',
    })
  }
  if (e instanceof Anthropic.RateLimitError) {
    return createError({
      statusCode: 429,
      statusMessage:
        'Claude APIのレート制限に達しました。少し時間を置いて再試行してください。',
    })
  }
  if (e instanceof Anthropic.BadRequestError) {
    const msg = e.message || ''
    // クレジット残高不足は文言で判別する(Anthropic側に専用エラー型なし)
    if (/credit balance|billing|insufficient/i.test(msg)) {
      return createError({
        statusCode: 502,
        statusMessage:
          'Anthropic APIのクレジット残高が不足しています。Console → Settings → Billing からチャージしてください。',
      })
    }
    return createError({
      statusCode: 400,
      statusMessage: `Claude API リクエストエラー: ${truncate(msg, 200)}`,
    })
  }
  if (e instanceof Anthropic.APIError) {
    return createError({
      statusCode: 502,
      statusMessage: `Claude API エラー (${e.status ?? '?'}): ${truncate(e.message ?? '', 200)}`,
    })
  }
  // 想定外
  console.error('[claude] unexpected error:', e)
  return createError({
    statusCode: 500,
    statusMessage: '生成サーバで想定外のエラーが発生しました',
  })
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
