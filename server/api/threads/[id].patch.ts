import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database, UpdateTables } from '~/types/db'
import type { ConversationThread } from '~/types/domain'

interface PatchRequest {
  title?: string | null
  default_length?: 'short' | 'medium' | 'long'
  default_affection?: number
  default_reply_flow?: 'continue' | 'cut'
  default_extra_instructions?: string | null
}

/**
 * PATCH /api/threads/:id
 * スレッドのタイトル / 生成設定デフォルトを更新する。
 */
export default defineEventHandler(
  async (event): Promise<{ thread: ConversationThread }> => {
    const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

    const body = await readBody<Partial<PatchRequest>>(event)
    if (!body || typeof body !== 'object')
      throw createError({ statusCode: 400, statusMessage: 'invalid body' })

    const updates: UpdateTables<'conversation_threads'> = {}
    if ('title' in body) updates.title = body.title?.trim() || null
    if (
      body.default_length === 'short' ||
      body.default_length === 'medium' ||
      body.default_length === 'long'
    ) {
      updates.default_length = body.default_length
    }
    if (
      typeof body.default_affection === 'number' &&
      body.default_affection >= 1 &&
      body.default_affection <= 10
    ) {
      updates.default_affection = Math.round(body.default_affection)
    }
    if (
      body.default_reply_flow === 'continue' ||
      body.default_reply_flow === 'cut'
    ) {
      updates.default_reply_flow = body.default_reply_flow
    }
    if ('default_extra_instructions' in body) {
      updates.default_extra_instructions =
        body.default_extra_instructions?.trim().slice(0, 500) || null
    }

    if (Object.keys(updates).length === 0)
      throw createError({ statusCode: 400, statusMessage: 'no fields to update' })

    const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
    const { data, error } = await supabase
      .from('conversation_threads')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data) throw createError({ statusCode: 404, statusMessage: 'thread not found' })

    return { thread: data as ConversationThread }
  },
)
