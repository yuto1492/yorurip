import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'
import type { Channel } from '~/types/domain'

const VALID_CHANNELS: Channel[] = ['dm', 'x_post', 'thanks']
const RE_ANALYZE_INTERVAL = 5 // 5件ごとに再分析

interface CopyEventRequest {
  channel: Channel
  content: string
  historyId?: string
}

export interface CopyEventResponse {
  ok: true
  sampleCount: number
  shouldAnalyze: boolean
}

/**
 * 編集後コピー時の自動学習ロギング:
 *   - tone_samples に source=auto_edited で追加
 *   - generation_history が指定されていれば final_copied を更新
 *   - チャネル別総件数を返却 / 5件ごとの閾値到達フラグを返却
 *
 * shouldAnalyze=true ならクライアントから /api/tone/analyze を背景発火する。
 *
 * 呼び出し元:
 *   - /generate のコピー押下時 (channel = mode から導出)
 *   - /threads/[id] の adopt 押下時 (channel = 'dm' 固定、ユーザー編集された場合のみ)
 */
export default defineEventHandler(async (event): Promise<CopyEventResponse> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const body = await readBody<Partial<CopyEventRequest>>(event)
  if (!body || typeof body !== 'object')
    throw createError({ statusCode: 400, statusMessage: 'invalid body' })

  // 口調学習は単一バケット ('dm') に統一されたため、リクエストの channel は無視。
  // VALID_CHANNELS は型整合性のため残置するが、検証はもう行わない。
  void VALID_CHANNELS

  const content = (body.content ?? '').trim()
  if (!content)
    throw createError({ statusCode: 400, statusMessage: 'content required' })
  if (content.length > 2000)
    throw createError({ statusCode: 400, statusMessage: 'content too long' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  // 1. 口調サンプル追加
  const { error: insertErr } = await supabase.from('tone_samples').insert({
    user_id: user.id,
    channel: 'dm',
    content,
    source: 'auto_edited',
  })
  if (insertErr)
    throw createError({ statusCode: 500, statusMessage: insertErr.message })

  // 2. 履歴に最終コピー文を反映 (失敗してもブロックしない)
  if (typeof body.historyId === 'string' && body.historyId) {
    const { error: histErr } = await supabase
      .from('generation_history')
      .update({ final_copied: content })
      .eq('id', body.historyId)
      .eq('user_id', user.id)
    if (histErr) console.warn('[copy-event] history update failed:', histErr.message)
  }

  // 3. チャネル別件数 → 5の倍数で再分析を発火
  const { count, error: countErr } = await supabase
    .from('tone_samples')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('channel', 'dm')
  if (countErr)
    throw createError({ statusCode: 500, statusMessage: countErr.message })

  const sampleCount = count ?? 0
  const shouldAnalyze = sampleCount >= 5 && sampleCount % RE_ANALYZE_INTERVAL === 0

  return { ok: true, sampleCount, shouldAnalyze }
})
