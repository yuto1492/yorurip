import { serverSupabaseClient } from '#supabase/server'
import { getAuthClient, getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'
import type { ConversationThread } from '~/types/domain'

export interface ThreadListItem extends ConversationThread {
  /** 表示用に同梱: 客のニックネーム */
  customer_nickname?: string
  /** 直近メッセージ プレビュー(最後の outgoing or incoming の本文先頭) */
  last_preview?: string | null
  last_direction?: 'incoming' | 'outgoing' | null
}

/**
 * GET /api/threads
 * 自分のスレッド一覧。最終メッセージ日時降順、各行に客名と直近メッセージのプレビューを同梱。
 */
export default defineEventHandler(
  async (event): Promise<{ threads: ThreadListItem[] }> => {
    const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    const supabase = getAuthClient(event)
  if (!supabase) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

    // 1) スレッド一覧
    const { data: threads, error } = await supabase
      .from('conversation_threads')
      .select('*')
      .is('archived_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })

    if (!threads || threads.length === 0) return { threads: [] }

    // 2) 関連客名を一括取得
    const customerIds = Array.from(
      new Set(threads.map((t) => t.customer_id).filter(Boolean) as string[]),
    )
    const { data: customers } = await supabase
      .from('customers')
      .select('id, nickname')
      .in('id', customerIds)
    const nicknameById = new Map<string, string>()
    for (const c of customers ?? []) nicknameById.set(c.id, c.nickname)

    // 3) 各スレッドの直近メッセージを 1 件取得
    const threadIds = threads.map((t) => t.id)
    const { data: lastMsgs } = await supabase
      .from('conversation_thread_messages')
      .select('thread_id, direction, content, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(threads.length * 3) // ざっくり多めに引いて手元で thread 別に最初の1件を採用
    const lastByThread = new Map<
      string,
      { direction: 'incoming' | 'outgoing'; content: string }
    >()
    for (const m of lastMsgs ?? []) {
      if (!lastByThread.has(m.thread_id)) {
        lastByThread.set(m.thread_id, {
          direction: m.direction as 'incoming' | 'outgoing',
          content: m.content,
        })
      }
    }

    return {
      threads: threads.map((t) => {
        const last = lastByThread.get(t.id)
        return {
          ...(t as ConversationThread),
          customer_nickname: nicknameById.get(t.customer_id) ?? undefined,
          last_direction: last?.direction ?? null,
          last_preview: last?.content?.slice(0, 60) ?? null,
        }
      }),
    }
  },
)
