import { defineStore } from 'pinia'
import type {
  ConversationThread,
  ConversationThreadMessage,
  Customer,
  GenerateResponse,
  MessageDirection,
  MessageSource,
  ReplyFlow,
} from '~/types/domain'

export interface ThreadListItem extends ConversationThread {
  customer_nickname?: string
  last_preview?: string | null
  last_direction?: 'incoming' | 'outgoing' | null
}

export interface ThreadDetail {
  thread: ConversationThread
  customer: Customer
  messages: ConversationThreadMessage[]
}

interface PatchThreadInput {
  title?: string | null
  default_length?: 'short' | 'medium' | 'long'
  default_affection?: number
  default_reply_flow?: ReplyFlow
  default_extra_instructions?: string | null
}

interface GenerateInput {
  incomingMessage?: string
  lengthPreference?: 'short' | 'medium' | 'long'
  affectionLevel?: number
  replyFlow?: ReplyFlow
  extraInstructions?: string
}

export const useThreadsStore = defineStore('threads', () => {
  const list = ref<ThreadListItem[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function fetchList(): Promise<void> {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ threads: ThreadListItem[] }>('/api/threads')
      list.value = res.threads
      loaded.value = true
    } catch (e: unknown) {
      const err = e as { data?: { statusMessage?: string }; message?: string }
      error.value =
        err?.data?.statusMessage ?? err?.message ?? '読み込みに失敗しました'
    } finally {
      loading.value = false
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value && !loading.value) await fetchList()
  }

  async function create(customerId: string): Promise<ConversationThread> {
    const res = await $fetch<{ thread: ConversationThread }>('/api/threads', {
      method: 'POST',
      body: { customerId },
    })
    // 一覧を再取得(client-side で merge してもよいがシンプルに)
    await fetchList()
    return res.thread
  }

  async function fetchOne(id: string): Promise<ThreadDetail> {
    return await $fetch<ThreadDetail>(`/api/threads/${id}`)
  }

  async function patchThread(
    id: string,
    updates: PatchThreadInput,
  ): Promise<ConversationThread> {
    const res = await $fetch<{ thread: ConversationThread }>(
      `/api/threads/${id}`,
      { method: 'PATCH', body: updates },
    )
    // 一覧キャッシュも更新
    list.value = list.value.map((t) =>
      t.id === id ? { ...t, ...res.thread } : t,
    )
    return res.thread
  }

  async function remove(id: string): Promise<void> {
    await $fetch(`/api/threads/${id}`, { method: 'DELETE' })
    list.value = list.value.filter((t) => t.id !== id)
  }

  async function addMessage(
    threadId: string,
    direction: MessageDirection,
    content: string,
    source: MessageSource = 'manual',
  ): Promise<ConversationThreadMessage> {
    const res = await $fetch<{ message: ConversationThreadMessage }>(
      `/api/threads/${threadId}/messages`,
      {
        method: 'POST',
        body: { direction, content, source },
      },
    )
    return res.message
  }

  async function deleteMessage(threadId: string, msgId: string): Promise<void> {
    await $fetch(`/api/threads/${threadId}/messages/${msgId}`, {
      method: 'DELETE',
    })
  }

  async function generate(
    threadId: string,
    input: GenerateInput,
  ): Promise<GenerateResponse> {
    return await $fetch<GenerateResponse>(
      `/api/threads/${threadId}/generate`,
      { method: 'POST', body: input },
    )
  }

  return {
    list,
    loading,
    loaded,
    error,
    fetchList,
    ensureLoaded,
    create,
    fetchOne,
    patchThread,
    remove,
    addMessage,
    deleteMessage,
    generate,
  }
})
