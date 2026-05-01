import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'

interface ResetResponse {
  ok: true
  deleted: Record<string, number | null>
}

/**
 * 現在のユーザーが所有する事業データを全削除する。
 * (user_profile は残す — 再オンボーディングしなくても続けて使える状態)
 *
 * RLS により user_id = auth.uid() で絞られるので service role 不要。
 * 対象テーブル:
 *   - conversation_thread_messages
 *   - conversation_threads
 *   - conversation_memos
 *   - visit_logs
 *   - tone_samples
 *   - generation_history
 *   - customers (visit_logs / conversation_memos は CASCADE で消えるが
 *                明示的に消した方が件数の挙動が分かりやすい)
 */
export default defineEventHandler(async (event): Promise<ResetResponse> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const deleted: Record<string, number | null> = {}

  // 削除順: 子テーブル → 親テーブル (FK 衝突防止のため。CASCADE もあるが念のため)
  const tables = [
    'conversation_thread_messages',
    'conversation_threads',
    'conversation_memos',
    'visit_logs',
    'tone_samples',
    'generation_history',
    'customers',
  ] as const

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', user.id)
      .select('id')
    if (error) {
      console.warn(`[reset-data] ${table} failed`, error.message)
      deleted[table] = null
    } else {
      deleted[table] = data?.length ?? 0
    }
  }

  return { ok: true, deleted }
})
