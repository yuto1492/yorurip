import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database, InsertTables } from '~/types/db'
import type { ConversationThreadMessage } from '~/types/domain'

interface AddMessageRequest {
  direction: 'incoming' | 'outgoing'
  content: string
  source?: 'manual' | 'ai_generated' | 'ai_regenerated'
}

/**
 * POST /api/threads/:id/messages
 * スレッドにメッセージを追加。incoming(相手) / outgoing(自分) どちらも。
 * source は AI 由来か手動入力か区別。
 */
export default defineEventHandler(
  async (event): Promise<{ message: ConversationThreadMessage }> => {
    const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    const threadId = getRouterParam(event, 'id')
    if (!threadId)
      throw createError({ statusCode: 400, statusMessage: 'thread id required' })

    const body = await readBody<Partial<AddMessageRequest>>(event)
    if (!body || typeof body !== 'object')
      throw createError({ statusCode: 400, statusMessage: 'invalid body' })

    if (body.direction !== 'incoming' && body.direction !== 'outgoing')
      throw createError({ statusCode: 400, statusMessage: 'invalid direction' })

    const content = body.content?.trim()
    if (!content)
      throw createError({ statusCode: 400, statusMessage: 'content required' })
    if (content.length > 4000)
      throw createError({ statusCode: 400, statusMessage: 'content too long' })

    const source =
      body.source === 'ai_generated' || body.source === 'ai_regenerated'
        ? body.source
        : 'manual'

    const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    // スレッドの所有確認(RLS で自動)
    const { data: thread, error: tErr } = await supabase
      .from('conversation_threads')
      .select('id')
      .eq('id', threadId)
      .maybeSingle()
    if (tErr) throw createError({ statusCode: 500, statusMessage: tErr.message })
    if (!thread)
      throw createError({ statusCode: 404, statusMessage: 'thread not found' })

    const insert: InsertTables<'conversation_thread_messages'> = {
      thread_id: threadId,
      user_id: user.id,
      direction: body.direction,
      content,
      source,
    }

    const { data, error } = await supabase
      .from('conversation_thread_messages')
      .insert(insert)
      .select()
      .single()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })

    // last_message_at を更新(失敗してもブロックしない)
    const { error: updErr } = await supabase
      .from('conversation_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId)
    if (updErr)
      console.warn('[threads/messages] last_message_at update failed:', updErr.message)

    return { message: data as ConversationThreadMessage }
  },
)
