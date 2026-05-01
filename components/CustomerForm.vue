<script setup lang="ts">
import {
  CUSTOMER_TYPE_OPTIONS,
  isOshiSystemIndustry,
  type Customer,
  type CustomerPreferences,
  type CustomerType,
} from '~/types/domain'
import type { CustomerInput } from '~/stores/customers'
import { useUserStore } from '~/stores/user'

interface Props {
  initial?: Customer | null
  submitLabel?: string
  loading?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  initial: null,
  submitLabel: '保存',
  loading: false,
})

const emit = defineEmits<{
  submit: [input: CustomerInput]
  cancel: []
}>()

const userStore = useUserStore()
const isConcafe = computed(
  () => userStore.industry === 'concafe' || userStore.industry === 'menkon',
)
const isOshiSystem = computed(() => isOshiSystemIndustry(userStore.industry))

// ----- 初期値 ---------------------------------------
const initialPref = (props.initial?.preferences ?? {}) as CustomerPreferences
const initialGoods = Array.isArray(props.initial?.goods_owned)
  ? (props.initial!.goods_owned as string[])
  : []

const nickname = ref(props.initial?.nickname ?? '')
const age = ref<number | null>(props.initial?.age ?? null)
const occupation = ref(props.initial?.occupation ?? '')
const customerType = ref<CustomerType | null>(
  (props.initial?.customer_type as CustomerType | null) ?? null,
)
const relationScore = ref<number | null>(props.initial?.relation_score ?? null)
const ngTime = ref(props.initial?.ng_time ?? '')
const lastVisitAt = ref(props.initial?.last_visit_at?.slice(0, 10) ?? '')

const prefSmoking = ref<boolean | null>(initialPref.smoking ?? null)
const prefAlcohol = ref(initialPref.alcohol ?? '')
const prefChampagne = ref(initialPref.champagne ?? '')
const prefFood = ref(initialPref.food ?? '')
const prefOthers = ref(initialPref.others ?? '')

const chekiCount = ref<number>(props.initial?.cheki_count ?? 0)
const oshiRank = ref(props.initial?.oshi_rank ?? '')
const goodsText = ref(initialGoods.join(', '))

// 業種で絞り込んだカスタマータイプ選択肢:
//   推し制度のある業種(コンカフェ/メンコン/ホスト)では推し系も全部出す。
//   それ以外は太客/痛客/マメ/塩 と「同業キャスト」のみ。
const customerTypeOptions = computed(() =>
  isOshiSystem.value
    ? CUSTOMER_TYPE_OPTIONS
    : CUSTOMER_TYPE_OPTIONS.filter((o) => !o.oshiSystemOnly),
)

const canSubmit = computed(() => !props.loading && nickname.value.trim().length > 0)

function handleSubmit(): void {
  if (!canSubmit.value) return

  const preferences: CustomerPreferences = {}
  if (prefSmoking.value !== null) preferences.smoking = prefSmoking.value
  if (prefAlcohol.value.trim()) preferences.alcohol = prefAlcohol.value.trim()
  if (prefChampagne.value.trim()) preferences.champagne = prefChampagne.value.trim()
  if (prefFood.value.trim()) preferences.food = prefFood.value.trim()
  if (prefOthers.value.trim()) preferences.others = prefOthers.value.trim()

  const goods = goodsText.value
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const input: CustomerInput = {
    nickname: nickname.value.trim(),
    age: typeof age.value === 'number' ? age.value : null,
    occupation: occupation.value.trim() || null,
    customer_type: customerType.value,
    relation_score: relationScore.value,
    ng_time: ngTime.value.trim() || null,
    last_visit_at: lastVisitAt.value || null,
    preferences,
    cheki_count: chekiCount.value,
    oshi_rank: oshiRank.value.trim() || null,
    goods_owned: goods,
  }
  emit('submit', input)
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <!-- 基本情報 -->
    <fieldset class="space-y-3">
      <legend class="text-[11px] uppercase tracking-wider text-ink-400 mb-1">基本情報</legend>

      <div>
        <label class="block text-xs text-ink-400 mb-1">
          ニックネーム <span class="text-accent">*</span>
        </label>
        <input
          v-model="nickname"
          type="text"
          required
          maxlength="80"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
        >
      </div>

      <div>
        <label class="block text-xs text-ink-400 mb-1">年齢 (任意)</label>
        <input
          v-model.number="age"
          type="number"
          min="0"
          max="120"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
        >
      </div>

      <div>
        <label class="block text-xs text-ink-400 mb-1">職業 (任意)</label>
        <input
          v-model="occupation"
          type="text"
          maxlength="80"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
        >
      </div>
    </fieldset>

    <!-- 関係性 -->
    <fieldset class="space-y-3">
      <legend class="text-[11px] uppercase tracking-wider text-ink-400 mb-1">関係性</legend>

      <div>
        <label class="block text-xs text-ink-400 mb-1.5">タイプ</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in customerTypeOptions"
            :key="opt.value"
            type="button"
            class="rounded-full border px-3 py-1 text-[11px] transition"
            :class="customerType === opt.value
              ? 'border-accent bg-accent/10 text-accent-soft'
              : 'border-ink-800 text-ink-400'"
            @click="customerType = customerType === opt.value ? null : opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div>
        <label class="block text-xs text-ink-400 mb-1.5">関係性スコア (1=塩 ~ 5=ガチ)</label>
        <div class="flex gap-1.5">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            class="flex-1 rounded-xl border py-1.5 text-xs"
            :class="relationScore === n
              ? 'border-accent bg-accent/10 text-accent-soft'
              : 'border-ink-800 text-ink-400'"
            @click="relationScore = relationScore === n ? null : n"
          >{{ n }}</button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-ink-400 mb-1">NG時間帯 (任意)</label>
          <input
            v-model="ngTime"
            type="text"
            maxlength="40"
            placeholder="例: 平日朝"
            class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
          >
        </div>
        <div>
          <label class="block text-xs text-ink-400 mb-1">最終来店日 (任意)</label>
          <input
            v-model="lastVisitAt"
            type="date"
            class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
          >
        </div>
      </div>
    </fieldset>

    <!-- 好み -->
    <fieldset class="space-y-3">
      <legend class="text-[11px] uppercase tracking-wider text-ink-400 mb-1">好み (任意)</legend>

      <div>
        <label class="block text-xs text-ink-400 mb-1.5">タバコ</label>
        <div class="flex gap-1.5">
          <button
            type="button"
            class="flex-1 rounded-xl border py-1.5 text-xs"
            :class="prefSmoking === true ? 'border-accent text-accent-soft' : 'border-ink-800 text-ink-400'"
            @click="prefSmoking = prefSmoking === true ? null : true"
          >吸う</button>
          <button
            type="button"
            class="flex-1 rounded-xl border py-1.5 text-xs"
            :class="prefSmoking === false ? 'border-accent text-accent-soft' : 'border-ink-800 text-ink-400'"
            @click="prefSmoking = prefSmoking === false ? null : false"
          >吸わない</button>
          <button
            type="button"
            class="flex-1 rounded-xl border py-1.5 text-xs"
            :class="prefSmoking === null ? 'border-ink-700 text-ink-400' : 'border-ink-800 text-ink-400/60'"
            @click="prefSmoking = null"
          >不明</button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-ink-400 mb-1">酒</label>
          <input v-model="prefAlcohol" type="text" placeholder="例: 焼酎水割り"
                 class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs text-ink-400 mb-1">シャンパン</label>
          <input v-model="prefChampagne" type="text" placeholder="例: モエ"
                 class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm">
        </div>
      </div>

      <div>
        <label class="block text-xs text-ink-400 mb-1">食べ物</label>
        <input v-model="prefFood" type="text" placeholder="例: 寿司"
               class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm">
      </div>

      <div>
        <label class="block text-xs text-ink-400 mb-1">その他</label>
        <textarea v-model="prefOthers" rows="2"
                  class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm" />
      </div>
    </fieldset>

    <!-- コンカフェ拡張 -->
    <fieldset v-if="isConcafe" class="space-y-3">
      <legend class="text-[11px] uppercase tracking-wider text-accent-soft mb-1">
        コンカフェ拡張
      </legend>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-ink-400 mb-1">チェキ枚数</label>
          <input v-model.number="chekiCount" type="number" min="0"
                 class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs text-ink-400 mb-1">推しランク</label>
          <input v-model="oshiRank" type="text" placeholder="例: ガチ恋勢"
                 class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm">
        </div>
      </div>

      <div>
        <label class="block text-xs text-ink-400 mb-1">所有グッズ (カンマ区切り)</label>
        <input v-model="goodsText" type="text" placeholder="例: 推しTシャツ, アクスタ"
               class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm">
      </div>
    </fieldset>

    <!-- ボタン -->
    <div class="flex gap-2 pt-2">
      <button
        type="submit"
        class="flex-1 rounded-2xl bg-accent text-ink-950 font-semibold py-3 disabled:opacity-50"
        :disabled="!canSubmit"
      >
        {{ loading ? '保存中…' : submitLabel }}
      </button>
      <button
        type="button"
        class="rounded-2xl bg-ink-800 text-ink-50 font-medium px-5"
        :disabled="loading"
        @click="emit('cancel')"
      >
        キャンセル
      </button>
    </div>
  </form>
</template>
