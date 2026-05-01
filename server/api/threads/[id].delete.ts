import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'

/**
 * DELETE /api/threads/:id
 * スレッド削除。CASCADE で messages も削除される。
 */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const { error } = await supabase
    .from('conversation_threads')
    .delete()
    .eq('id', id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
