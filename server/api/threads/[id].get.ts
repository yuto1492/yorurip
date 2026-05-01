import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'
import type {
  ConversationThread,
  ConversationThreadMessage,
  Customer,
} from '~/types/domain'

export interface ThreadDetailResponse {
  thread: ConversationThread
  customer: Customer
  messages: ConversationThreadMessage[]
}

/**
 * GET /api/threads/:id
 * スレッド詳細 + 客情報 + 全メッセージ(時系列昇順) を同梱。
 */
export default defineEventHandler(
  async (event): Promise<ThreadDetailResponse> => {
    const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

    const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    const { data: thread, error: tErr } = await supabase
      .from('conversation_threads')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (tErr) throw createError({ statusCode: 500, statusMessage: tErr.message })
    if (!thread)
      throw createError({ statusCode: 404, statusMessage: 'thread not found' })

    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', thread.customer_id)
      .maybeSingle()
    if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
    if (!customer)
      throw createError({ statusCode: 404, statusMessage: 'customer not found' })

    const { data: messages, error: mErr } = await supabase
      .from('conversation_thread_messages')
      .select('*')
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
      .limit(500)
    if (mErr) throw createError({ statusCode: 500, statusMessage: mErr.message })

    return {
      thread: thread as ConversationThread,
      customer: customer as Customer,
      messages: (messages ?? []) as ConversationThreadMessage[],
    }
  },
)
