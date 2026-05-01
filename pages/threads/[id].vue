<script setup lang="ts">
import { useThreadsStore, type ThreadDetail } from '~/stores/threads'
import type {
  ConversationThread,
  ConversationThreadMessage,
  Customer,
  MessageDirection,
  ReplyFlow,
} from '~/types/domain'

useHead({ title: '会話 | ヨルリプ' })
// pageTransition なし。NavigationLoader が API 待ちを覆う。
definePageMeta({})

const route = useRoute()
const router = useRouter()
const store = useThreadsStore()

const threadId = String(route.params.id)

const thread = ref<ConversationThread | null>(null)
const customer = ref<Customer | null>(null)
const messages = ref<ConversationThreadMessage[]>([])
const loadError = ref<string | null>(null)
const initialLoading = ref(true)

async function reload(): Promise<void> {
  try {
    const detail: ThreadDetail = await store.fetchOne(threadId)
    thread.value = detail.thread
    customer.value = detail.customer
    messages.value = detail.messages
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    loadError.value =
      err?.data?.statusMessage ?? err?.message ?? '読み込みに失敗しました'
  } finally {
    initialLoading.value = false
  }
}
await reload()

// ----- 入力欄 -------------------------------------------
const composeRole = ref<MessageDirection>('incoming') // デフォルト: 相手から来た文面
const composeText = ref('')
const sending = ref(false)
const sendError = ref<string | null>(null)

async function sendMessage(): Promise<void> {
  const text = composeText.value.trim()
  if (!text || sending.value) return
  sending.value = true
  sendError.value = null
  try {
    const msg = await store.addMessage(threadId, composeRole.value, text, 'manual')
    messages.value = [...messages.value, msg]
    composeText.value = ''
    scrollToBottomSoon()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    sendError.value =
      err?.data?.statusMessage ?? err?.message ?? '送信に失敗しました'
  } finally {
    sending.value = false
  }
}

async function deleteMessage(msgId: string): Promise<void> {
  if (!window.confirm('このメッセージを削除しますか?')) return
  try {
    await store.deleteMessage(threadId, msgId)
    messages.value = messages.value.filter((m) => m.id !== msgId)
  } catch (e) {
    console.warn('[delete message]', e)
    sendError.value = '削除に失敗しました'
  }
}

// ----- 生成 ---------------------------------------------
const candidates = ref<string[]>([])
const editedCandidates = ref<string[]>([])
const generating = ref(false)
const generateError = ref<string | null>(null)

// 生成前ダイアログで集める入力 (毎回上書き、最後に使った値はスレッドに保存)
const showGenerateDialog = ref(false)
const genLength = ref<'short' | 'medium' | 'long'>('medium')
const genAffection = ref(5)
const genReplyFlow = ref<ReplyFlow>('continue')
const genExtraInstructions = ref('')

function openGenerateDialog(): void {
  if (!thread.value || generating.value) return
  // 直近の値で初期化(初回はスキーマデフォルト)
  genLength.value = thread.value.default_length as 'short' | 'medium' | 'long'
  genAffection.value = thread.value.default_affection
  genReplyFlow.value = thread.value.default_reply_flow as ReplyFlow
  genExtraInstructions.value = thread.value.default_extra_instructions ?? ''
  generateError.value = null
  showGenerateDialog.value = true
}

async function confirmGenerate(): Promise<void> {
  if (generating.value || !thread.value) return
  showGenerateDialog.value = false

  // 入力欄に「客から」のテキストが残っていたら、まず保存してから生成
  const pending = composeText.value.trim()
  if (composeRole.value === 'incoming' && pending) {
    await sendMessage()
  }

  generating.value = true
  generateError.value = null
  const length = genLength.value
  const affection = genAffection.value
  const replyFlow = genReplyFlow.value
  const extra = genExtraInstructions.value.trim()
  try {
    const res = await store.generate(threadId, {
      lengthPreference: length,
      affectionLevel: affection,
      replyFlow,
      extraInstructions: extra || undefined,
    })
    candidates.value = [...res.candidates]
    editedCandidates.value = [...res.candidates]

    // 次回ダイアログで前回値を出すためスレッドに保存(失敗してもブロックしない)
    const prevLength = thread.value.default_length
    const prevAffection = thread.value.default_affection
    const prevFlow = thread.value.default_reply_flow
    const prevExtra = thread.value.default_extra_instructions ?? ''
    if (
      prevLength !== length ||
      prevAffection !== affection ||
      prevFlow !== replyFlow ||
      prevExtra !== extra
    ) {
      try {
        const updated = await store.patchThread(threadId, {
          default_length: length,
          default_affection: affection,
          default_reply_flow: replyFlow,
          default_extra_instructions: extra || null,
        })
        thread.value = updated
      } catch (e) {
        console.warn('[persist gen prefs]', e)
      }
    }
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    generateError.value =
      err?.data?.statusMessage ?? err?.message ?? '生成に失敗しました'
  } finally {
    generating.value = false
  }
}

const adopting = ref<number | null>(null)
const showCopyModal = ref(false)
const copiedPreview = ref('')
const expandedCandidates = ref(false) // 候補をフル画面で表示するか

async function adopt(index: number): Promise<void> {
  const text = editedCandidates.value[index]?.trim()
  if (!text || adopting.value !== null) return
  adopting.value = index
  try {
    const source = candidates.value[index] === editedCandidates.value[index]
      ? 'ai_generated'
      : 'manual' // 編集された案は manual 扱い

    // 採用 = LINE / X 等にすぐ貼り付ける想定なので自動でクリップボードへ
    let copySucceeded = false
    try {
      await navigator.clipboard.writeText(text)
      copySucceeded = true
    } catch (e) {
      console.warn('clipboard write failed', e)
    }

    const msg = await store.addMessage(threadId, 'outgoing', text, source)
    messages.value = [...messages.value, msg]
    candidates.value = []
    editedCandidates.value = []
    composeText.value = ''
    composeRole.value = 'incoming'
    scrollToBottomSoon()

    if (copySucceeded) {
      copiedPreview.value = text
      showCopyModal.value = true
    } else {
      generateError.value =
        '採用しましたが、クリップボードへのコピーに失敗しました。'
    }

    // 編集された候補が採用された時のみ自動口調学習。
    // AI 生成そのままを採用した場合は学習対象にしない (それは AI の口調なので)。
    // チャネルは 'dm' 固定 (スレッドは 1on1 想定)。
    if (source === 'manual') {
      $fetch<{ ok: true; sampleCount: number; shouldAnalyze: boolean }>(
        '/api/copy-event',
        { method: 'POST', body: { channel: 'dm', content: text } },
      )
        .then((res) => {
          if (res.shouldAnalyze) {
            $fetch('/api/tone/analyze', {
              method: 'POST',
              body: { channel: 'dm' },
            }).catch((e) => console.warn('[tone analyze]', e))
          }
        })
        .catch((e) => console.warn('[copy-event]', e))
    }
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    generateError.value =
      err?.data?.statusMessage ?? err?.message ?? '採用に失敗しました'
  } finally {
    adopting.value = null
  }
}

function discardCandidates(): void {
  candidates.value = []
  editedCandidates.value = []
}

async function copyCandidate(index: number): Promise<void> {
  const text = editedCandidates.value[index]
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedIndex.value = index
    setTimeout(() => {
      if (copiedIndex.value === index) copiedIndex.value = null
    }, 1500)
  } catch (e) {
    console.warn('clipboard write failed', e)
  }
}
const copiedIndex = ref<number | null>(null)

// ----- スクロール ----------------------------------------
const scrollAnchor = ref<HTMLElement | null>(null)
function scrollToBottomSoon(): void {
  nextTick(() => {
    scrollAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  })
}
onMounted(() => scrollToBottomSoon())

// ----- 設定モーダル (長さ / 愛情度 のみ) -----------------
const showSettings = ref(false)
const draftLength = ref<'short' | 'medium' | 'long'>('medium')
const draftAffection = ref(5)
const savingSettings = ref(false)
const settingsError = ref<string | null>(null)

function openSettings(): void {
  if (!thread.value) return
  draftLength.value = thread.value.default_length as 'short' | 'medium' | 'long'
  draftAffection.value = thread.value.default_affection
  settingsError.value = null
  showSettings.value = true
}

async function saveSettings(): Promise<void> {
  if (savingSettings.value) return
  savingSettings.value = true
  settingsError.value = null
  try {
    const updated = await store.patchThread(threadId, {
      default_length: draftLength.value,
      default_affection: draftAffection.value,
    })
    thread.value = updated
    showSettings.value = false
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    settingsError.value =
      err?.data?.statusMessage ?? err?.message ?? '保存に失敗しました'
  } finally {
    savingSettings.value = false
  }
}

async function deleteThread(): Promise<void> {
  if (!window.confirm('このスレッドを削除します。会話の履歴も全て消えます。よろしいですか?'))
    return
  try {
    await store.remove(threadId)
    await router.replace('/threads')
  } catch (e) {
    console.warn('[delete thread]', e)
  }
}

// ----- 表示ヘルパー --------------------------------------
function fmtTime(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const m = (n: number) => String(n).padStart(2, '0')
  return `${m(d.getHours())}:${m(d.getMinutes())}`
}

const headerTitle = computed(() => {
  if (!customer.value) return '(削除された客)'
  return customer.value.nickname
})

const LENGTH_OPTIONS = ['short', 'medium', 'long'] as const
const FLOW_OPTIONS = ['continue', 'cut'] as const
</script>

<template>
  <section class="flex flex-col min-h-[100dvh] max-w-md mx-auto bg-ink-950">
    <!-- ヘッダー -->
    <header class="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
      <NuxtLink
        to="/threads"
        class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-ink-900 border border-ink-800 text-ink-50 active:scale-[.97]"
        aria-label="戻る"
      >‹</NuxtLink>
      <NuxtLink
        v-if="customer"
        :to="`/customers/${customer.id}?from=/threads/${threadId}`"
        class="flex-1 min-w-0 active:opacity-80 transition"
      >
        <div class="text-sm font-semibold truncate flex items-center gap-1">
          <span class="truncate">{{ headerTitle }}</span>
          <span aria-hidden="true" class="text-ink-400 text-xs">›</span>
        </div>
        <div v-if="messages.length > 0" class="text-[10px] text-ink-400">
          {{ messages.length }}件のやり取り · 客情報を見る
        </div>
        <div v-else class="text-[10px] text-ink-400">客情報を見る</div>
      </NuxtLink>
      <div v-else class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate">{{ headerTitle }}</div>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-[11px] px-3 py-1.5 active:scale-[.97] hover:border-accent/40"
        @click="openSettings"
      >愛情度の設定</button>
    </header>

    <!-- メッセージリスト -->
    <div class="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
      <p v-if="loadError" class="text-xs text-red-400">{{ loadError }}</p>
      <p v-if="initialLoading" class="text-xs text-ink-400">読み込み中…</p>

      <p
        v-else-if="messages.length === 0"
        class="text-xs text-ink-400 leading-relaxed text-center mt-8"
      >
        まだやり取りがありません。<br>
        下の入力欄で「客から来た文面」を保存して<br>
        <strong>返信を生成</strong> を押すと AI が3案返します。
      </p>

      <div
        v-for="m in messages"
        :key="m.id"
        :class="m.direction === 'outgoing' ? 'flex justify-end' : 'flex justify-start'"
      >
        <div class="group max-w-[80%]">
          <div
            class="rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
            :class="m.direction === 'outgoing'
              ? 'bg-accent text-ink-950 rounded-br-sm'
              : 'bg-ink-900 border border-ink-800 text-ink-50 rounded-bl-sm'"
          >{{ m.content }}</div>
          <div
            class="mt-0.5 flex items-center gap-2 text-[10px] text-ink-400"
            :class="m.direction === 'outgoing' ? 'justify-end' : 'justify-start'"
          >
            <span>{{ fmtTime(m.created_at) }}</span>
            <span v-if="m.source !== 'manual'" class="text-accent-soft">AI</span>
            <button
              type="button"
              class="opacity-0 group-hover:opacity-100 transition text-red-300/70 hover:text-red-300"
              @click="deleteMessage(m.id)"
            >削除</button>
          </div>
        </div>
      </div>

      <!-- 返信生成 CTA: 自分(outgoing)側のバブル位置に出す -->
      <div
        v-if="messages.length > 0 && editedCandidates.length === 0"
        class="flex justify-end"
      >
        <button
          type="button"
          class="rounded-2xl rounded-br-sm border border-dashed border-accent/50 bg-accent/10 text-accent-soft text-sm px-4 py-2 hover:bg-accent/20 disabled:opacity-50 active:scale-[.98] transition"
          :disabled="generating"
          @click="openGenerateDialog"
        >{{ generating ? '生成中…' : '✨ 返信を生成' }}</button>
      </div>

      <div ref="scrollAnchor" />
    </div>

    <!-- 候補パネル -->
    <div
      v-if="editedCandidates.length > 0"
      class="border-t border-ink-800 bg-ink-900/60 px-4 py-3 space-y-2"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-[11px] uppercase tracking-wider text-ink-400">
          AI 返信候補 (編集可)
        </h2>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-full bg-ink-800 text-ink-50 text-[11px] px-2.5 py-1 inline-flex items-center gap-1 active:scale-[.97]"
            aria-label="フル画面で表示"
            @click="expandedCandidates = true"
          >
            <svg viewBox="0 0 24 24" class="w-3 h-3" fill="currentColor" aria-hidden="true">
              <path d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 0h2v7h-7v-2h5v-5z"/>
            </svg>
            拡大
          </button>
          <button
            type="button"
            class="text-[11px] text-ink-400 hover:text-ink-50 disabled:opacity-50"
            :disabled="generating"
            @click="discardCandidates"
          >破棄</button>
          <button
            type="button"
            class="rounded-full bg-ink-800 text-ink-50 text-[11px] px-2.5 py-1 disabled:opacity-50"
            :disabled="generating"
            @click="openGenerateDialog"
          >{{ generating ? '考え中…' : '再生成' }}</button>
        </div>
      </div>

      <!-- 再生成中バナー -->
      <div
        v-if="generating"
        class="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 flex items-center gap-2"
      >
        <span
          class="inline-block w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin"
          aria-hidden="true"
        />
        <span class="text-xs text-accent-soft">考え中… 新しい3案を生成しています</span>
      </div>

      <div
        v-for="(c, i) in editedCandidates"
        :key="i"
        class="rounded-xl border border-ink-800 bg-ink-950 p-2.5 transition-opacity"
        :class="generating ? 'opacity-50' : ''"
      >
        <textarea
          v-model="editedCandidates[i]"
          rows="3"
          :disabled="generating"
          class="w-full bg-transparent text-sm leading-relaxed resize-y focus:outline-none disabled:cursor-not-allowed"
        />
        <div class="mt-1.5 flex items-center justify-between gap-2">
          <span class="text-[10px] text-ink-400">案 {{ i + 1 }} · {{ editedCandidates[i].length }}字</span>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-full text-[11px] px-2.5 py-1 transition disabled:opacity-50"
              :class="copiedIndex === i ? 'bg-accent/20 text-accent-soft' : 'bg-ink-800 text-ink-50'"
              :disabled="generating"
              @click="copyCandidate(i)"
            >{{ copiedIndex === i ? 'コピー済 ✓' : 'コピー' }}</button>
            <button
              type="button"
              class="rounded-full bg-accent text-ink-950 text-[11px] font-semibold px-3 py-1 disabled:opacity-50 active:scale-[.97]"
              :disabled="generating || adopting !== null || !editedCandidates[i].trim()"
              @click="adopt(i)"
            >{{ adopting === i ? '採用中…' : '採用' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 入力欄 -->
    <div class="sticky bottom-0 z-10 border-t border-ink-800 bg-ink-950/95 backdrop-blur px-4 py-3 space-y-2">
      <p v-if="generateError" class="text-xs text-red-400">{{ generateError }}</p>
      <p v-if="sendError" class="text-xs text-red-400">{{ sendError }}</p>

      <!-- 役割切替 -->
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-full border px-3 py-1 text-xs transition"
          :class="composeRole === 'incoming'
            ? 'border-accent bg-accent/10 text-accent-soft'
            : 'border-ink-800 text-ink-400'"
          @click="composeRole = 'incoming'"
        >客から</button>
        <button
          type="button"
          class="flex-1 rounded-full border px-3 py-1 text-xs transition"
          :class="composeRole === 'outgoing'
            ? 'border-accent bg-accent/10 text-accent-soft'
            : 'border-ink-800 text-ink-400'"
          @click="composeRole = 'outgoing'"
        >自分から</button>
      </div>

      <div class="flex items-end gap-2">
        <textarea
          v-model="composeText"
          rows="2"
          :placeholder="composeRole === 'incoming'
            ? '客から届いた文面を貼り付け / 入力'
            : '自分が送った文面を入力 (履歴用)'"
          class="flex-1 min-w-0 rounded-2xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm leading-relaxed resize-none"
          maxlength="4000"
        />
        <button
          type="button"
          class="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full bg-accent text-ink-950 disabled:bg-ink-800 disabled:text-ink-400 active:scale-[.95] transition"
          :disabled="sending || !composeText.trim()"
          :aria-label="composeRole === 'incoming' ? '客の文面を保存' : '自分の文面を保存'"
          @click="sendMessage"
        >
          <svg
            v-if="!sending"
            viewBox="0 0 24 24"
            class="w-5 h-5"
            fill="currentColor"
            aria-hidden="true"
          ><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          <span v-else class="text-[10px]">…</span>
        </button>
      </div>
    </div>

    <!-- 設定モーダル: 長さ / 愛情度 のみ -->
    <Teleport to="body">
      <div
        v-if="showSettings"
        class="fixed inset-0 z-50 flex flex-col bg-ink-950/95 backdrop-blur"
      >
        <div class="px-6 py-4 flex items-center justify-between border-b border-ink-800/60">
          <h2 class="text-base font-bold">愛情度の設定</h2>
          <button
            type="button"
            class="rounded-full bg-ink-800 text-ink-50 text-xs px-3 py-1.5 active:scale-[.97]"
            @click="showSettings = false"
          >閉じる</button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-4 max-w-md mx-auto w-full space-y-4">
          <div>
            <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
              長さの希望
            </label>
            <div class="flex gap-2">
              <button
                v-for="len in LENGTH_OPTIONS"
                :key="`s-len-${len}`"
                type="button"
                class="flex-1 rounded-xl border px-3 py-1.5 text-xs transition"
                :class="draftLength === len
                  ? 'border-accent text-accent-soft'
                  : 'border-ink-800 text-ink-400'"
                @click="draftLength = len"
              >{{ len === 'short' ? '短め' : len === 'medium' ? '普通' : '長め' }}</button>
            </div>
          </div>

          <div>
            <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
              愛情度
              <span class="ml-1 text-accent-soft">{{ draftAffection }}/10</span>
            </label>
            <input
              v-model.number="draftAffection"
              type="range"
              min="1"
              max="10"
              step="1"
              class="w-full accent-pink-500"
            >
            <div class="mt-0.5 flex justify-between text-[11px] text-ink-400">
              <span>← 塩</span>
              <span>愛情 →</span>
            </div>
          </div>

          <p v-if="settingsError" class="text-xs text-red-400">{{ settingsError }}</p>

          <button
            type="button"
            class="w-full rounded-xl bg-accent text-ink-950 font-semibold py-2.5 active:scale-[.99] disabled:opacity-50"
            :disabled="savingSettings"
            @click="saveSettings"
          >{{ savingSettings ? '保存中…' : '保存' }}</button>

          <hr class="border-ink-800 my-4">

          <button
            type="button"
            class="w-full rounded-xl border border-red-500/40 text-red-300 text-sm py-2 hover:bg-red-500/10 active:scale-[.99]"
            @click="deleteThread"
          >このスレッドを削除</button>
        </div>
      </div>
    </Teleport>

    <!-- 生成前ダイアログ: 会話の流れ + 返信に含めたい内容 -->
    <Teleport to="body">
      <div
        v-if="showGenerateDialog"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/70 backdrop-blur-sm"
        @click.self="showGenerateDialog = false"
      >
        <div class="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-ink-900 border border-ink-800 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold">返信を生成</h2>
            <button
              type="button"
              class="rounded-full bg-ink-800 text-ink-50 text-xs px-3 py-1 active:scale-[.97]"
              @click="showGenerateDialog = false"
            >キャンセル</button>
          </div>

          <div>
            <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
              長さの希望
            </label>
            <div class="flex gap-2">
              <button
                v-for="len in LENGTH_OPTIONS"
                :key="`g-len-${len}`"
                type="button"
                class="flex-1 rounded-xl border px-3 py-1.5 text-xs transition"
                :class="genLength === len
                  ? 'border-accent text-accent-soft'
                  : 'border-ink-800 text-ink-400'"
                @click="genLength = len"
              >{{ len === 'short' ? '短め' : len === 'medium' ? '普通' : '長め' }}</button>
            </div>
          </div>

          <div>
            <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
              愛情度
              <span class="ml-1 text-accent-soft">{{ genAffection }}/10</span>
            </label>
            <input
              v-model.number="genAffection"
              type="range"
              min="1"
              max="10"
              step="1"
              class="w-full accent-pink-500"
            >
            <div class="mt-0.5 flex justify-between text-[11px] text-ink-400">
              <span>← 塩</span>
              <span>愛情 →</span>
            </div>
          </div>

          <div>
            <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
              会話の流れ
            </label>
            <div class="flex gap-2">
              <button
                v-for="flow in FLOW_OPTIONS"
                :key="`g-flow-${flow}`"
                type="button"
                class="flex-1 rounded-xl border px-3 py-1.5 text-xs transition"
                :class="genReplyFlow === flow
                  ? 'border-accent text-accent-soft'
                  : 'border-ink-800 text-ink-400'"
                @click="genReplyFlow = flow"
              >{{ flow === 'continue' ? '会話を続ける' : '会話を切る' }}</button>
            </div>
            <p class="mt-1 text-[10px] text-ink-400 leading-relaxed">
              続ける = 末尾に次の話題/質問を振る / 切る = 「またね」程度で自然に結ぶ
            </p>
          </div>

          <div>
            <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
              返信に含めたい内容
              <span class="ml-1 normal-case tracking-normal text-ink-400/80">(任意・空欄でも OK)</span>
            </label>
            <textarea
              v-model="genExtraInstructions"
              rows="3"
              maxlength="500"
              placeholder="例: 来週イベントあるって告知も入れて / 体調気遣う一言を入れて"
              class="w-full rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm leading-relaxed"
            />
            <p class="mt-1 text-[10px] text-ink-400 leading-relaxed">
              空のままでも生成できます。指定した場合はその内容を自然に組み込みます。
            </p>
          </div>

          <button
            type="button"
            class="w-full rounded-xl bg-accent text-ink-950 font-semibold py-2.5 active:scale-[.99] disabled:opacity-50"
            :disabled="generating"
            @click="confirmGenerate"
          >{{ generating ? '生成中…' : '✨ 3案を生成' }}</button>
        </div>
      </div>
    </Teleport>

    <!-- 候補フル画面モーダル -->
    <Teleport to="body">
      <div
        v-if="expandedCandidates && editedCandidates.length > 0"
        class="fixed inset-0 z-50 flex flex-col bg-ink-950"
      >
        <header class="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
          <button
            type="button"
            class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-ink-900 border border-ink-800 text-ink-50 active:scale-[.97]"
            aria-label="閉じる"
            @click="expandedCandidates = false"
          >×</button>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold">AI 返信候補</div>
            <div class="text-[10px] text-ink-400">編集して採用すると LINE / X 等にコピーされます</div>
          </div>
          <button
            type="button"
            class="rounded-full bg-ink-800 text-ink-50 text-[11px] px-3 py-1.5 disabled:opacity-50 active:scale-[.97]"
            :disabled="generating"
            @click="openGenerateDialog"
          >{{ generating ? '考え中…' : '再生成' }}</button>
        </header>

        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-md mx-auto w-full">
          <div
            v-if="generating"
            class="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 flex items-center gap-2"
          >
            <span
              class="inline-block w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <span class="text-xs text-accent-soft">考え中… 新しい3案を生成しています</span>
          </div>

          <div
            v-for="(c, i) in editedCandidates"
            :key="i"
            class="rounded-2xl border border-ink-800 bg-ink-900 p-3 transition-opacity"
            :class="generating ? 'opacity-50' : ''"
          >
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-[11px] uppercase tracking-wider text-ink-400">
                案 {{ i + 1 }}
              </span>
              <span class="text-[10px] text-ink-400">{{ editedCandidates[i].length }}字</span>
            </div>
            <textarea
              v-model="editedCandidates[i]"
              rows="8"
              :disabled="generating"
              class="w-full rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:cursor-not-allowed"
            />
            <div class="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                class="rounded-full text-xs px-3 py-1.5 transition disabled:opacity-50"
                :class="copiedIndex === i ? 'bg-accent/20 text-accent-soft' : 'bg-ink-800 text-ink-50'"
                :disabled="generating"
                @click="copyCandidate(i)"
              >{{ copiedIndex === i ? 'コピー済 ✓' : 'コピーのみ' }}</button>
              <button
                type="button"
                class="rounded-full bg-accent text-ink-950 text-xs font-semibold px-4 py-1.5 disabled:opacity-50 active:scale-[.97]"
                :disabled="generating || adopting !== null || !editedCandidates[i].trim()"
                @click="adopt(i)"
              >{{ adopting === i ? '採用中…' : '採用 (コピー+保存)' }}</button>
            </div>
          </div>

          <button
            type="button"
            class="w-full rounded-xl border border-ink-800 text-ink-400 text-xs py-2 hover:text-ink-50 disabled:opacity-50"
            :disabled="generating"
            @click="discardCandidates"
          >すべて破棄して閉じる</button>
        </div>
      </div>
    </Teleport>

    <!-- コピー完了モーダル -->
    <Teleport to="body">
      <div
        v-if="showCopyModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm px-4"
        @click.self="showCopyModal = false"
      >
        <div class="w-full max-w-sm rounded-2xl bg-ink-900 border border-accent/40 p-5 space-y-3 shadow-2xl">
          <div class="flex items-center gap-2 text-accent-soft">
            <span class="text-xl" aria-hidden="true">✓</span>
            <span class="text-sm font-semibold">コピーしました</span>
          </div>
          <p class="text-xs text-ink-400 leading-relaxed">
            クリップボードにコピーしました。<br>
            LINE や X にそのまま貼り付けて送信できます。
          </p>
          <div class="rounded-md bg-ink-950 border border-ink-800/60 px-3 py-2 text-xs text-ink-50 max-h-32 overflow-auto whitespace-pre-wrap break-words">
            {{ copiedPreview }}
          </div>
          <button
            type="button"
            class="w-full rounded-xl bg-accent text-ink-950 text-xs font-semibold py-2 active:scale-[.99]"
            @click="showCopyModal = false"
          >閉じる</button>
        </div>
      </div>
    </Teleport>
  </section>
</template>
