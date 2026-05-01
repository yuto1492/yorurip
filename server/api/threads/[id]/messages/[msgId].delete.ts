import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'

/**
 * DELETE /api/threads/:id/messages/:msgId
 * 個別メッセージの削除。
 */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const threadId = getRouterParam(event, 'id')
  const msgId = getRouterParam(event, 'msgId')
  if (!threadId || !msgId)
    throw createError({ statusCode: 400, statusMessage: 'id required' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const { error } = await supabase
    .from('conversation_thread_messages')
    .delete()
    .eq('id', msgId)
    .eq('thread_id', threadId)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
