<script setup lang="ts">
import { useCustomersStore, type CustomerInput } from '~/stores/customers'
import { useUserStore } from '~/stores/user'
import {
  CUSTOMER_TYPE_OPTIONS,
  type ConversationMemo,
  type Customer,
  type CustomerPreferences,
  type CustomerType,
  type GenerationMode,
  type VisitLog,
} from '~/types/domain'

const route = useRoute()
const router = useRouter()
const store = useCustomersStore()

const id = String(route.params.id)
useHead({ title: '客情報 | ヨルリプ' })

// ?from=/threads/[id] で来た場合は「会話に戻る」リンクに切替
// 安全のため受け付けるのはアプリ内パス (/ で始まる) かつ既知の prefix のみ
const backFrom = computed<string | null>(() => {
  const f = route.query.from
  if (typeof f !== 'string') return null
  if (!f.startsWith('/threads/')) return null
  return f
})
const backLink = computed<string>(() => backFrom.value ?? '/customers')
const backLabel = computed<string>(() =>
  backFrom.value ? '‹ 会話に戻る' : '‹ 客管理',
)

// 詳細はキャッシュせず毎回取り直し(visit_logs/memosが変わるため)
const { data, error: fetchError } = await useAsyncData(
  `customer-${id}`,
  () => store.fetchOne(id),
  { server: false },
)

const customer = computed<Customer | null>(() => data.value?.customer ?? null)
const visits = computed<VisitLog[]>(() => data.value?.visits ?? [])
const memos = computed<ConversationMemo[]>(() => data.value?.memos ?? [])

const mode = ref<'view' | 'edit'>('view')
const saving = ref(false)
const deleting = ref(false)
const errorMsg = ref<string | null>(null)

async function handleSave(input: CustomerInput): Promise<void> {
  if (!customer.value) return
  saving.value = true
  errorMsg.value = null
  try {
    const updated = await store.update(customer.value.id, input)
    if (data.value) data.value.customer = updated
    mode.value = 'view'
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    errorMsg.value = err?.data?.statusMessage ?? err?.message ?? '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

async function handleDelete(): Promise<void> {
  if (!customer.value) return
  if (!window.confirm(`「${customer.value.nickname}」を削除します。よろしいですか?`)) return
  deleting.value = true
  errorMsg.value = null
  try {
    await store.remove(customer.value.id)
    await router.replace('/customers')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    errorMsg.value = err?.data?.statusMessage ?? err?.message ?? '削除に失敗しました'
    deleting.value = false
  }
}

function gotoGenerate(genMode: GenerationMode): void {
  router.push({
    path: '/generate',
    query: { mode: genMode, customerId: customer.value?.id },
  })
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  return d.slice(0, 10)
}

const userStore = useUserStore()
const isConcafe = computed(
  () => userStore.industry === 'concafe' || userStore.industry === 'menkon',
)

function customerTypeLabel(t: CustomerType | null | undefined): string {
  if (!t) return ''
  return CUSTOMER_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t
}

// preferences は jsonb なので型断定で取り出す
const preferences = computed<CustomerPreferences>(
  () => (customer.value?.preferences as CustomerPreferences) ?? {},
)

const goodsOwned = computed<string[]>(() =>
  Array.isArray(customer.value?.goods_owned)
    ? (customer.value!.goods_owned as string[])
    : [],
)

interface DetailRow {
  label: string
  value: string | null
}

// 「未登録」も含めて全項目を並べる。
// 業種でコンカフェ拡張(チェキ/推しランク/グッズ)を出すかを切替。
const detailRows = computed<DetailRow[]>(() => {
  const c = customer.value
  if (!c) return []

  const rows: DetailRow[] = [
    { label: '年齢', value: typeof c.age === 'number' ? `${c.age}` : null },
    { label: '職業', value: c.occupation?.trim() || null },
    { label: 'タイプ', value: customerTypeLabel(c.customer_type as CustomerType | null) || null },
    {
      label: '関係性',
      value: typeof c.relation_score === 'number' ? `${c.relation_score} / 5` : null,
    },
    { label: 'NG時間', value: c.ng_time?.trim() || null },
    { label: '最終来店', value: c.last_visit_at ? fmtDate(c.last_visit_at) : null },
  ]

  if (isConcafe.value) {
    rows.push(
      { label: 'チェキ枚数', value: c.cheki_count > 0 ? `${c.cheki_count}` : null },
      { label: '推しランク', value: c.oshi_rank?.trim() || null },
    )
  }

  return rows
})

const PREF_LABELS: Record<keyof CustomerPreferences, string> = {
  smoking: 'タバコ',
  alcohol: 'お酒',
  champagne: 'シャンパン',
  food: '食べ物',
  others: 'その他',
}

interface PrefRow {
  label: string
  value: string
}

const preferenceRows = computed<PrefRow[]>(() => {
  const p = preferences.value
  const out: PrefRow[] = []
  if (typeof p.smoking === 'boolean') {
    out.push({ label: PREF_LABELS.smoking, value: p.smoking ? '吸う' : '吸わない' })
  }
  if (p.alcohol?.trim()) out.push({ label: PREF_LABELS.alcohol, value: p.alcohol.trim() })
  if (p.champagne?.trim())
    out.push({ label: PREF_LABELS.champagne, value: p.champagne.trim() })
  if (p.food?.trim()) out.push({ label: PREF_LABELS.food, value: p.food.trim() })
  if (p.others?.trim()) out.push({ label: PREF_LABELS.others, value: p.others.trim() })
  return out
})

const generateButtons: { mode: GenerationMode; label: string; emoji: string }[] = [
  { mode: 'personal', label: '個人営業', emoji: '🎯' },
  { mode: 'reply', label: '返信', emoji: '💬' },
  { mode: 'thanks', label: 'お礼', emoji: '🌸' },
]
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto">
    <header class="mb-5">
      <NuxtLink
        :to="backLink"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >{{ backLabel }}</NuxtLink>
    </header>

    <p v-if="fetchError" class="text-sm text-red-400">読み込みに失敗しました。</p>

    <div v-else-if="!customer" class="text-sm text-ink-400">読み込み中…</div>

    <template v-else>
      <!-- ===== 表示モード ===== -->
      <template v-if="mode === 'view'">
        <h1 class="text-xl font-bold">
          {{ customer.nickname }}
        </h1>

        <div class="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span
            v-if="customer.customer_type"
            class="rounded-full border border-ink-800 px-2 py-0.5 text-ink-400"
          >{{ customerTypeLabel(customer.customer_type) }}</span>
          <span
            v-if="customer.relation_score"
            class="rounded-full border border-accent/40 px-2 py-0.5 text-accent-soft"
          >関係性 {{ customer.relation_score }}/5</span>
          <span
            v-if="isConcafe && customer.cheki_count > 0"
            class="rounded-full border border-ink-800 px-2 py-0.5 text-ink-400"
          >📷 {{ customer.cheki_count }}</span>
        </div>

        <p v-if="errorMsg" class="mt-3 text-xs text-red-400">{{ errorMsg }}</p>

        <!-- 生成ショートカット -->
        <div class="mt-5">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">この客で生成</p>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="g in generateButtons"
              :key="g.mode"
              type="button"
              class="rounded-xl border border-ink-800 bg-ink-900 px-2 py-3 text-xs flex flex-col items-center gap-1 active:scale-[.98]"
              @click="gotoGenerate(g.mode)"
            >
              <span class="text-lg">{{ g.emoji }}</span>
              <span>{{ g.label }}</span>
            </button>
          </div>
        </div>

        <!-- 詳細フィールド: 未登録も「—」で見える形に -->
        <div class="mt-6 rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">基本情報</p>
          <dl class="text-sm space-y-1.5">
            <div
              v-for="row in detailRows"
              :key="row.label"
              class="flex gap-3"
            >
              <dt class="text-ink-400 w-24 shrink-0">{{ row.label }}</dt>
              <dd
                class="flex-1 break-all"
                :class="row.value ? 'text-ink-50' : 'text-ink-400/60 italic'"
              >
                {{ row.value ?? '—' }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- 好み (整形して表示) -->
        <div class="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">好み</p>
          <dl
            v-if="preferenceRows.length > 0"
            class="text-sm space-y-1.5"
          >
            <div
              v-for="row in preferenceRows"
              :key="row.label"
              class="flex gap-3"
            >
              <dt class="text-ink-400 w-24 shrink-0">{{ row.label }}</dt>
              <dd class="flex-1 break-all">{{ row.value }}</dd>
            </div>
          </dl>
          <p v-else class="text-xs text-ink-400/70 italic">未登録</p>
        </div>

        <!-- 所有グッズ (コンカフェ系のみ) -->
        <div v-if="isConcafe" class="mt-3">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">所有グッズ</p>
          <div v-if="goodsOwned.length > 0" class="flex flex-wrap gap-1">
            <span
              v-for="(g, i) in goodsOwned"
              :key="i"
              class="rounded-full border border-ink-800 px-2 py-0.5 text-[11px] text-ink-50"
            >{{ g }}</span>
          </div>
          <p v-else class="text-xs text-ink-400/70 italic">未登録</p>
        </div>

        <!-- メモ -->
        <div v-if="memos.length > 0" class="mt-6">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">
            会話メモ ({{ memos.length }})
          </p>
          <ul class="space-y-2">
            <li
              v-for="m in memos"
              :key="m.id"
              class="rounded-xl border border-ink-800 bg-ink-900 px-3 py-2"
            >
              <div class="flex items-center gap-2 text-[10px] text-ink-400 mb-1">
                <span>{{ fmtDate(m.memo_date) }}</span>
                <span class="rounded px-1 border border-ink-800">
                  {{ m.source === 'tool_use_approved' ? 'AI承認' : '手動' }}
                </span>
              </div>
              <p class="text-xs leading-relaxed">{{ m.content }}</p>
            </li>
          </ul>
        </div>

        <!-- 来店履歴 -->
        <div v-if="visits.length > 0" class="mt-6">
          <p class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">
            来店履歴 ({{ visits.length }})
          </p>
          <ul class="space-y-1">
            <li
              v-for="v in visits"
              :key="v.id"
              class="rounded-xl border border-ink-800 bg-ink-900 px-3 py-2 text-xs"
            >
              <div class="flex items-center justify-between">
                <span>{{ fmtDate(v.visit_date) }}</span>
                <span v-if="v.amount" class="text-ink-400">¥{{ v.amount.toLocaleString() }}</span>
              </div>
              <div class="mt-0.5 flex gap-1.5 text-[10px] text-ink-400">
                <span v-if="v.is_dohan">同伴</span>
                <span v-if="v.is_after">アフター</span>
                <span v-if="v.cheki_taken > 0">チェキ {{ v.cheki_taken }}</span>
              </div>
              <p v-if="v.note" class="mt-1 text-[11px] leading-relaxed">{{ v.note }}</p>
            </li>
          </ul>
        </div>

        <!-- アクション -->
        <div class="mt-8 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-2xl bg-accent text-ink-950 font-semibold py-3"
            @click="mode = 'edit'"
          >編集</button>
          <button
            type="button"
            class="rounded-2xl bg-red-600/20 text-red-300 px-5 font-medium border border-red-600/30 disabled:opacity-50"
            :disabled="deleting"
            @click="handleDelete"
          >
            {{ deleting ? '削除中…' : '削除' }}
          </button>
        </div>
      </template>

      <!-- ===== 編集モード ===== -->
      <template v-else>
        <h1 class="text-xl font-bold mb-5">客情報の編集</h1>
        <p v-if="errorMsg" class="mb-3 text-xs text-red-400">{{ errorMsg }}</p>
        <CustomerForm
          :initial="customer"
          :loading="saving"
          submit-label="保存"
          @submit="handleSave"
          @cancel="mode = 'view'"
        />
      </template>
    </template>
  </section>
</template>
