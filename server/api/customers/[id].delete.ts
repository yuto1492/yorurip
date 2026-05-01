import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'

/**
 * DELETE /api/customers/:id
 * カルテを削除。CASCADE で visit_logs / conversation_memos / generation_history.customer_id も連動。
 */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
