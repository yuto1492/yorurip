import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database, InsertTables, Json } from '~/types/db'
import type { Customer, CustomerType } from '~/types/domain'

const VALID_CUSTOMER_TYPES: CustomerType[] = [
  'futo',
  'ita',
  'mame',
  'shio',
  'oshi_gachi',
  'oshi_enjoy',
]

interface CreateRequest {
  nickname: string
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
 * POST /api/customers
 * 新規カルテ作成。ニックネームのみ必須。
 */
export default defineEventHandler(async (event): Promise<{ customer: Customer }> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const body = await readBody<Partial<CreateRequest>>(event)
  if (!body || typeof body !== 'object')
    throw createError({ statusCode: 400, statusMessage: 'invalid body' })

  const nickname = body.nickname?.trim()
  if (!nickname)
    throw createError({ statusCode: 400, statusMessage: 'nickname required' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const insert: InsertTables<'customers'> = {
    user_id: user.id,
    nickname,
    age: typeof body.age === 'number' && body.age >= 0 ? Math.floor(body.age) : null,
    occupation: body.occupation?.trim() || null,
    customer_type:
      body.customer_type && VALID_CUSTOMER_TYPES.includes(body.customer_type)
        ? body.customer_type
        : null,
    relation_score:
      typeof body.relation_score === 'number' &&
      body.relation_score >= 1 &&
      body.relation_score <= 5
        ? Math.floor(body.relation_score)
        : null,
    ng_time: body.ng_time?.trim() || null,
    last_visit_at: body.last_visit_at || null,
    preferences: ((body.preferences as Record<string, unknown> | undefined) ?? {}) as Json,
    cheki_count:
      typeof body.cheki_count === 'number' && body.cheki_count >= 0
        ? Math.floor(body.cheki_count)
        : 0,
    oshi_rank: body.oshi_rank?.trim() || null,
    goods_owned: Array.isArray(body.goods_owned)
      ? (body.goods_owned.filter((g) => typeof g === 'string') as Json)
      : ([] as Json),
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(insert)
    .select()
    .single()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { customer: data as Customer }
})
