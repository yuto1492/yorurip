import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'
import type { ConversationMemo, Customer, VisitLog } from '~/types/domain'

export interface CustomerDetailResponse {
  customer: Customer
  visits: VisitLog[]
  memos: ConversationMemo[]
}

/**
 * GET /api/customers/:id
 * カルテ詳細 + 直近の visit_logs / conversation_memos を同梱して返す。
 */
export default defineEventHandler(async (event): Promise<CustomerDetailResponse> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
  if (!customer)
    throw createError({ statusCode: 404, statusMessage: 'customer not found' })

  const { data: visits, error: vErr } = await supabase
    .from('visit_logs')
    .select('*')
    .eq('customer_id', id)
    .order('visit_date', { ascending: false })
    .limit(20)
  if (vErr) throw createError({ statusCode: 500, statusMessage: vErr.message })

  const { data: memos, error: mErr } = await supabase
    .from('conversation_memos')
    .select('*')
    .eq('customer_id', id)
    .order('memo_date', { ascending: false })
    .limit(20)
  if (mErr) throw createError({ statusCode: 500, statusMessage: mErr.message })

  return {
    customer: customer as Customer,
    visits: (visits ?? []) as VisitLog[],
    memos: (memos ?? []) as ConversationMemo[],
  }
})
