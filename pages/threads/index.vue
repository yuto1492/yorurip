<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useThreadsStore } from '~/stores/threads'

useHead({ title: '客と会話 | ヨルリプ' })
definePageMeta({
  pageTransition: { name: 'slide-left', mode: 'out-in', appear: false },
})

const store = useThreadsStore()
const { list, loading, error } = storeToRefs(store)

await store.ensureLoaded()

// 削除モード: ON 中はカードがリンクではなく削除ボタンとして振る舞う
const deleteMode = ref(false)
const deletingId = ref<string | null>(null)

async function removeThread(id: string, label: string): Promise<void> {
  if (deletingId.value) return
  if (!window.confirm(`「${label}」とのスレッドを削除します。会話の履歴も全て消えます。よろしいですか?`))
    return
  deletingId.value = id
  try {
    await store.remove(id)
  } catch (e) {
    console.warn('[delete thread]', e)
    window.alert('削除に失敗しました')
  } finally {
    deletingId.value = null
  }
}

function fmtDateTime(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const m = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${m(d.getMonth() + 1)}/${m(d.getDate())} ${m(d.getHours())}:${m(d.getMinutes())}`
}
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto">
    <header class="mb-5 flex items-center justify-between gap-2">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ ホーム</NuxtLink>
      <div class="flex items-center gap-2">
        <button
          v-if="list.length > 0"
          type="button"
          class="rounded-full border w-8 h-8 flex items-center justify-center text-xs transition active:scale-[.95]"
          :class="deleteMode
            ? 'border-red-500/60 bg-red-500/10 text-red-300'
            : 'border-ink-800 text-ink-400 hover:border-red-500/40 hover:text-red-300'"
          :aria-label="deleteMode ? '削除モードを終了' : 'スレッドを削除'"
          @click="deleteMode = !deleteMode"
        >
          <span v-if="deleteMode" aria-hidden="true">✓</span>
          <span v-else aria-hidden="true">🗑</span>
        </button>
        <NuxtLink
          v-if="!deleteMode"
          to="/threads/new"
          class="rounded-full bg-accent text-ink-950 text-xs font-semibold px-3 py-1.5"
        >+ 新規スレッド</NuxtLink>
      </div>
    </header>

    <h1 class="text-xl font-bold mb-1">客と会話</h1>
    <p
      v-if="deleteMode"
      class="mb-3 text-[11px] text-red-300/90"
    >削除モード: タップで削除します。終わったら ✓ を押してください。</p>
    <div v-else class="mb-3" />

    <p v-if="error" class="mb-3 text-xs text-red-400">{{ error }}</p>
    <p v-if="loading && list.length === 0" class="text-xs text-ink-400">読み込み中…</p>

    <p
      v-else-if="!loading && list.length === 0"
      class="text-sm text-ink-400 leading-relaxed"
    >
      まだスレッドがありません。<br>
      右上の <strong>+ 新規スレッド</strong> から客を選んで会話を始めてください。
    </p>

    <ul v-else class="space-y-2">
      <li v-for="t in list" :key="t.id">
        <component
          :is="deleteMode ? 'button' : 'NuxtLink'"
          :type="deleteMode ? 'button' : undefined"
          :to="deleteMode ? undefined : `/threads/${t.id}`"
          :disabled="deleteMode && deletingId === t.id"
          class="block w-full text-left rounded-2xl border px-4 py-3 transition active:scale-[.99] disabled:opacity-50"
          :class="deleteMode
            ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10'
            : 'border-ink-800 bg-ink-900'"
          @click="deleteMode
            ? removeThread(t.id, t.customer_nickname ?? '削除された客')
            : undefined"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="font-semibold truncate">
                {{ t.customer_nickname ?? '(削除された客)' }}
                <span v-if="t.title" class="text-ink-400 text-xs">— {{ t.title }}</span>
              </div>
              <p
                v-if="t.last_preview"
                class="mt-1 text-[11px] text-ink-400 truncate"
              >
                <span class="opacity-70">
                  {{ t.last_direction === 'incoming' ? '客' : '自分' }}:
                </span>
                {{ t.last_preview }}
              </p>
              <p v-else class="mt-1 text-[11px] text-ink-400/70 italic">
                (まだメッセージなし)
              </p>
              <p class="mt-0.5 text-[10px] text-ink-400/60">
                {{ fmtDateTime(t.last_message_at ?? t.updated_at) }}
              </p>
            </div>
            <span
              v-if="deleteMode"
              aria-hidden="true"
              class="text-red-300 text-lg shrink-0"
            >×</span>
            <span v-else aria-hidden="true" class="text-ink-400">›</span>
          </div>
        </component>
      </li>
    </ul>
  </section>
</template>
