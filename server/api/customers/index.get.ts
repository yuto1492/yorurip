import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/db'
import type { Customer } from '~/types/domain'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'

export interface CustomerListResponse {
  customers: Customer[]
}

/**
 * GET /api/customers
 * 自分のカルテ一覧を返す。最終来店日が新しい順 → 更新日が新しい順。
 */
export default defineEventHandler(async (event): Promise<CustomerListResponse> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { customers: (data ?? []) as Customer[] }
})
