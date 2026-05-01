<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCustomersStore } from '~/stores/customers'
import { useThreadsStore } from '~/stores/threads'

useHead({ title: '新規スレッド | ヨルリプ' })
definePageMeta({
  // pageTransition なし (一覧 ↔ 客選択 の往復もトランジション無しで揃える)
})

const customersStore = useCustomersStore()
const threadsStore = useThreadsStore()
const { list: customers, loading: customersLoading } = storeToRefs(customersStore)

await customersStore.ensureLoaded()

const search = ref('')
const creating = ref(false)
const error = ref<string | null>(null)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return customers.value
  return customers.value.filter((c) =>
    c.nickname.toLowerCase().includes(q) ||
    (c.occupation?.toLowerCase().includes(q) ?? false),
  )
})

async function pick(customerId: string) {
  if (creating.value) return
  creating.value = true
  error.value = null
  try {
    const thread = await threadsStore.create(customerId)
    await navigateTo(`/threads/${thread.id}`)
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    error.value = err?.data?.statusMessage ?? err?.message ?? 'スレッド作成に失敗しました'
    creating.value = false
  }
}
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto">
    <header class="mb-5 flex items-center justify-between">
      <NuxtLink
        to="/threads"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ 戻る</NuxtLink>
      <NuxtLink
        to="/customers/new"
        class="rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5"
      >+ 客を新規登録</NuxtLink>
    </header>

    <h1 class="text-xl font-bold mb-1">新規スレッド</h1>
    <p class="text-xs text-ink-400 mb-4">
      会話を始める客を選んでください。
    </p>

    <input
      v-model="search"
      type="search"
      placeholder="ニックネーム / 職業で検索"
      class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm mb-4"
    >

    <p v-if="error" class="mb-3 text-xs text-red-400">{{ error }}</p>

    <p v-if="customersLoading && customers.length === 0" class="text-xs text-ink-400">
      読み込み中…
    </p>

    <p
      v-else-if="!customersLoading && customers.length === 0"
      class="text-sm text-ink-400 leading-relaxed"
    >
      まだ客が登録されていません。<br>
      右上の <strong>+ 客を新規登録</strong> から登録してください。
    </p>

    <p
      v-else-if="filtered.length === 0 && search"
      class="text-sm text-ink-400"
    >
      該当なし。
    </p>

    <ul v-else class="space-y-2">
      <li v-for="c in filtered" :key="c.id">
        <button
          type="button"
          :disabled="creating"
          class="w-full text-left block rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3 transition active:scale-[.99] disabled:opacity-50"
          @click="pick(c.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="font-semibold truncate">{{ c.nickname }}</div>
              <div v-if="c.occupation" class="mt-0.5 text-[11px] text-ink-400 truncate">
                {{ c.occupation }}
              </div>
            </div>
            <span aria-hidden="true" class="text-ink-400">›</span>
          </div>
        </button>
      </li>
    </ul>

    <p v-if="creating" class="mt-4 text-xs text-ink-400">スレッドを作成中…</p>
  </section>
</template>
