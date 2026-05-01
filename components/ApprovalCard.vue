<script setup lang="ts">
import type { Customer, ToolCallProposal } from '~/types/domain'

interface Props {
  proposal: ToolCallProposal
}
const props = defineProps<Props>()

const emit = defineEmits<{
  approved: [customer: Customer]
  dismissed: []
}>()

const loading = ref(false)
const error = ref<string | null>(null)

const isCreate = computed(() => props.proposal.type === 'propose_customer_create')
const title = computed(() =>
  isCreate.value ? '新規客情報の提案' : '客情報更新の提案',
)

interface FieldRow {
  key: string
  label: string
  value: string
}

const FIELD_LABELS: Record<string, string> = {
  customer_id: '客ID',
  nickname: 'ニックネーム',
  occupation: '職業',
  memo: '会話メモ',
  ng_time: 'NG時間',
  cheki_count: 'チェキ枚数',
  oshi_rank: '推しランク',
  goods_owned: 'グッズ',
  preferences: '好み',
}

const fieldRows = computed<FieldRow[]>(() => {
  const rows: FieldRow[] = []
  for (const [key, raw] of Object.entries(props.proposal.input)) {
    if (raw === undefined || raw === null || raw === '') continue
    let value: string
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue
      value = raw.join(' / ')
    } else if (typeof raw === 'object') {
      const entries = Object.entries(raw as Record<string, unknown>).filter(
        ([, v]) => v !== null && v !== undefined && v !== '',
      )
      if (entries.length === 0) continue
      value = entries.map(([k, v]) => `${k}: ${v}`).join(', ')
    } else {
      value = String(raw)
    }
    rows.push({ key, label: FIELD_LABELS[key] ?? key, value })
  }
  return rows
})

async function approve(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ customer: Customer }>(
      '/api/customers/approve',
      {
        method: 'POST',
        body: {
          type: props.proposal.type,
          input: props.proposal.input,
        },
      },
    )
    emit('approved', res.customer)
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    error.value = err?.data?.statusMessage ?? err?.message ?? '保存に失敗しました'
  } finally {
    loading.value = false
  }
}

function dismiss(): void {
  emit('dismissed')
}
</script>

<template>
  <div class="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
    <div class="flex items-center gap-2">
      <span class="text-amber-300/90 text-sm font-semibold">📋 {{ title }}</span>
      <span
        class="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border border-amber-400/30 text-amber-300/80"
      >
        {{ isCreate ? 'CREATE' : 'UPDATE' }}
      </span>
    </div>

    <ul class="mt-3 space-y-1.5 text-xs leading-relaxed">
      <li v-for="row in fieldRows" :key="row.key" class="flex gap-2">
        <span class="text-ink-400 shrink-0 min-w-[5em]">{{ row.label }}:</span>
        <span class="text-ink-50 break-all">{{ row.value }}</span>
      </li>
      <li v-if="fieldRows.length === 0" class="text-ink-400">
        提案内容が空です。却下推奨。
      </li>
    </ul>

    <p v-if="error" class="mt-2 text-[11px] text-red-400">{{ error }}</p>

    <div class="mt-3 flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-xl bg-accent text-ink-950 text-xs font-semibold py-2 disabled:opacity-50"
        :disabled="loading || fieldRows.length === 0"
        @click="approve"
      >
        {{ loading ? '保存中…' : '承認して保存' }}
      </button>
      <button
        type="button"
        class="rounded-xl bg-ink-800 text-ink-400 text-xs font-medium px-4 py-2 disabled:opacity-50"
        :disabled="loading"
        @click="dismiss"
      >
        却下
      </button>
    </div>
  </div>
</template>
