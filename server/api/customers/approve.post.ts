import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database, Json, UpdateTables } from '~/types/db'
import type { Customer } from '~/types/domain'

type ProposalType = 'propose_customer_create' | 'propose_customer_update'

interface ApproveInput {
  customer_id?: string
  nickname?: string
  preferences?: Record<string, unknown>
  occupation?: string
  memo?: string
  ng_time?: string
  cheki_count?: number
  oshi_rank?: string
  goods_owned?: string[]
}

interface ApproveRequest {
  type: ProposalType
  input: ApproveInput
}

interface ApproveResponse {
  customer: Customer
  memoSaved: boolean
}

/**
 * Tool Use 由来の承認カードからカルテを作成/更新する。
 * - propose_customer_create: customers に INSERT
 * - propose_customer_update: customers を UPDATE (RLS で本人所有のみ)
 * - input.memo があれば conversation_memos に source=tool_use_approved で INSERT
 */
export default defineEventHandler(async (event): Promise<ApproveResponse> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const body = await readBody<Partial<ApproveRequest>>(event)
  if (!body?.type || (body.type !== 'propose_customer_create' && body.type !== 'propose_customer_update'))
    throw createError({ statusCode: 400, statusMessage: 'invalid type' })
  if (!body.input || typeof body.input !== 'object')
    throw createError({ statusCode: 400, statusMessage: 'invalid input' })

  const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  const input = body.input

  let customer: Customer

  if (body.type === 'propose_customer_create') {
    const nickname = input.nickname?.trim()
    if (!nickname)
      throw createError({
        statusCode: 400,
        statusMessage: 'nickname required for create',
      })

    const { data, error } = await supabase
      .from('customers')
      .insert({
        user_id: user.id,
        nickname,
        occupation: input.occupation?.trim() || null,
        ng_time: input.ng_time?.trim() || null,
        preferences: (input.preferences ?? {}) as Json,
        cheki_count:
          typeof input.cheki_count === 'number' && input.cheki_count >= 0
            ? Math.floor(input.cheki_count)
            : 0,
        oshi_rank: input.oshi_rank?.trim() || null,
        goods_owned: Array.isArray(input.goods_owned)
          ? (input.goods_owned.filter((g) => typeof g === 'string') as Json)
          : ([] as Json),
      })
      .select()
      .single()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    customer = data as Customer
  } else {
    const customerId = input.customer_id?.trim()
    if (!customerId)
      throw createError({
        statusCode: 400,
        statusMessage: 'customer_id required for update',
      })

    const updates: UpdateTables<'customers'> = {}
    if (input.nickname?.trim()) updates.nickname = input.nickname.trim()
    if (input.occupation !== undefined)
      updates.occupation = input.occupation?.trim() || null
    if (input.ng_time !== undefined)
      updates.ng_time = input.ng_time?.trim() || null
    if (input.preferences && typeof input.preferences === 'object')
      updates.preferences = input.preferences as Json
    if (typeof input.cheki_count === 'number' && input.cheki_count >= 0)
      updates.cheki_count = Math.floor(input.cheki_count)
    if (input.oshi_rank !== undefined)
      updates.oshi_rank = input.oshi_rank?.trim() || null
    if (Array.isArray(input.goods_owned))
      updates.goods_owned = input.goods_owned.filter(
        (g) => typeof g === 'string',
      ) as Json

    if (Object.keys(updates).length === 0)
      throw createError({ statusCode: 400, statusMessage: 'no updatable fields' })

    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customerId)
      .eq('user_id', user.id)
      .select()
      .maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data)
      throw createError({ statusCode: 404, statusMessage: 'customer not found' })
    customer = data as Customer
  }

  // memo は別テーブル(conversation_memos)に保存
  let memoSaved = false
  const memo = input.memo?.trim()
  if (memo) {
    const { error: memoErr } = await supabase.from('conversation_memos').insert({
      user_id: user.id,
      customer_id: customer.id,
      content: memo,
      source: 'tool_use_approved',
    })
    if (memoErr) {
      console.warn('[approve] memo insert failed:', memoErr.message)
    } else {
      memoSaved = true
    }
  }

  return { customer, memoSaved }
})
