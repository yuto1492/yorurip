import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database, InsertTables } from '~/types/db'
import type { ConversationThread } from '~/types/domain'

interface CreateRequest {
  customerId: string
  title?: string | null
}

/**
 * POST /api/threads
 * 客指定で新規スレッドを作成。同じ客に既存スレッドがあっても複数作れる。
 */
export default defineEventHandler(
  async (event): Promise<{ thread: ConversationThread }> => {
    const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    const body = await readBody<Partial<CreateRequest>>(event)
    if (!body || typeof body !== 'object')
      throw createError({ statusCode: 400, statusMessage: 'invalid body' })

    const customerId = body.customerId?.trim()
    if (!customerId)
      throw createError({ statusCode: 400, statusMessage: 'customerId required' })

    const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    // 客の存在確認(RLS で自分の客のみ)
    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .select('id, nickname')
      .eq('id', customerId)
      .maybeSingle()
    if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
    if (!customer)
      throw createError({ statusCode: 404, statusMessage: 'customer not found' })

    const insert: InsertTables<'conversation_threads'> = {
      user_id: user.id,
      customer_id: customerId,
      title: body.title?.trim() || null,
    }

    const { data, error } = await supabase
      .from('conversation_threads')
      .insert(insert)
      .select()
      .single()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })

    return { thread: data as ConversationThread }
  },
)
