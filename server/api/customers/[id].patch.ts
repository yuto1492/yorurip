import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database, Json, UpdateTables } from '~/types/db'
import type { Customer, CustomerType } from '~/types/domain'

const VALID_CUSTOMER_TYPES: CustomerType[] = [
  'futo',
  'ita',
  'mame',
  'shio',
  'oshi_gachi',
  'oshi_enjoy',
]

interface PatchRequest {
  nickname?: string
  age?: number | null
  occupation?: string | null
  customer_type?: CustomerType | null
  relation_score?: number | null
  ng_time?: string | null
  last_visit_at?: string | null
  preferences?: Record<string, unknown>
  cheki_count?: number
  oshi_rank?: string | null
  goods_owned?: string[]
}

/**
 * PATCH /api/customers/:id
 * 部分更新。フィールドが body に含まれていれば更新対象、無ければ放置。
 */
export default defineEventHandler(async (event): Promise<{ customer: Customer }> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody<Partial<PatchRequest>>(event)
  if (!body || typeof body !== 'object')
    throw createError({ statusCode: 400, statusMessage: 'invalid body' })

  const updates: UpdateTables<'customers'> = {}
  if (typeof body.nickname === 'string' && body.nickname.trim())
    updates.nickname = body.nickname.trim()
  if ('age' in body)
    updates.age =
      typeof body.age === 'number' && body.age >= 0 ? Math.floor(body.age) : null
  if ('occupation' in body)
    updates.occupation = body.occupation?.trim() || null
  if ('customer_type' in body) {
    if (body.customer_type === null || body.customer_type === undefined) {
      updates.customer_type = null
    } else if (VALID_CUSTOMER_TYPES.includes(body.customer_type)) {
      updates.customer_type = body.customer_type
    }
  }
  if ('relation_score' in body) {
    if (body.relation_score === null) {
      updates.relation_score = null
    } else if (
      typeof body.relation_score === 'number' &&
      body.relation_score >= 1 &&
      body.relation_score <= 5
    ) {
      updates.relation_score = Math.floor(body.relation_score)
    }
  }
  if ('ng_time' in body) updates.ng_time = body.ng_time?.trim() || null
  if ('last_visit_at' in body)
    updates.last_visit_at = body.last_visit_at || null
  if ('preferences' in body && body.preferences && typeof body.preferences === 'object') {
    updates.preferences = body.preferences as Json
  }
  if (
    'cheki_count' in body &&
    typeof body.cheki_count === 'number' &&
    body.cheki_count >= 0
  ) {
    updates.cheki_count = Math.floor(body.cheki_count)
  }
  if ('oshi_rank' in body) updates.oshi_rank = body.oshi_rank?.trim() || null
  if ('goods_owned' in body && Array.isArray(body.goods_owned)) {
    updates.goods_owned = body.goods_owned.filter(
      (g) => typeof g === 'string',
    ) as Json
  }

  if (Object.keys(updates).length === 0)
    throw createError({ statusCode: 400, statusMessage: 'no fields to update' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'customer not found' })

  return { customer: data as Customer }
})
