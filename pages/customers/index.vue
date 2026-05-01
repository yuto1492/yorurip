<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCustomersStore } from '~/stores/customers'
import { useUserStore } from '~/stores/user'
import { CUSTOMER_TYPE_OPTIONS, type CustomerType } from '~/types/domain'

useHead({ title: '客管理 | ヨルリプ' })

const store = useCustomersStore()
const userStore = useUserStore()
const { list, loading, error } = storeToRefs(store)
const isConcafe = computed(
  () => userStore.industry === 'concafe' || userStore.industry === 'menkon',
)

await store.ensureLoaded()

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter((c) => {
    return (
      c.nickname.toLowerCase().includes(q) ||
      (c.occupation?.toLowerCase().includes(q) ?? false)
    )
  })
})

function typeLabel(t: CustomerType | null | undefined): string {
  if (!t) return ''
  return CUSTOMER_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? ''
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return d.slice(0, 10)
}
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto">
    <header class="mb-5 flex items-center justify-between">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ ホーム</NuxtLink>
      <NuxtLink
        to="/customers/new"
        class="rounded-full bg-accent text-ink-950 text-xs font-semibold px-3 py-1.5"
      >+ 新規</NuxtLink>
    </header>

    <h1 class="text-xl font-bold mb-4">客管理</h1>

    <input
      v-model="search"
      type="search"
      placeholder="ニックネーム / 呼び名 / 職業で検索"
      class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm mb-4"
    >

    <p v-if="error" class="mb-3 text-xs text-red-400">{{ error }}</p>

    <p v-if="loading && list.length === 0" class="text-xs text-ink-400">読み込み中…</p>

    <p
      v-else-if="!loading && filtered.length === 0 && list.length === 0"
      class="text-sm text-ink-400 leading-relaxed"
    >
      登録した客がまだいません。<br>
      右上の <strong>+ 新規</strong> から登録するか、生成画面で AI 提案を承認すると自動で増えます。
    </p>

    <p
      v-else-if="!loading && filtered.length === 0 && search"
      class="text-sm text-ink-400"
    >
      該当なし。
    </p>

    <ul v-else class="space-y-2">
      <li v-for="c in filtered" :key="c.id">
        <NuxtLink
          :to="`/customers/${c.id}`"
          class="block rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3 transition active:scale-[.99]"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="font-semibold truncate">
                {{ c.nickname }}
              </div>
              <div class="mt-0.5 flex items-center gap-2 text-[11px] text-ink-400">
                <span v-if="c.customer_type" class="rounded-full border border-ink-800 px-2 py-0.5">
                  {{ typeLabel(c.customer_type) }}
                </span>
                <span>最終来店: {{ formatDate(c.last_visit_at) }}</span>
                <span v-if="isConcafe && c.cheki_count > 0">📷{{ c.cheki_count }}</span>
              </div>
            </div>
            <span aria-hidden="true" class="text-ink-400">›</span>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
