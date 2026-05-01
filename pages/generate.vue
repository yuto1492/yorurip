<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGenerationStore } from '~/stores/generation'
import { useUserStore } from '~/stores/user'
import { useCustomersStore } from '~/stores/customers'
import { useXPostHashtagsStore } from '~/stores/xPostHashtags'
import {
  useGenerationHistoryStore,
  type HistoryEntry,
} from '~/stores/generationHistory'
import {
  HASHTAG_SUGGESTIONS,
  PUBLIC_POST_TEMPLATES,
  SALES_INTENT_TEMPLATES,
  THANKS_EVENT_TEMPLATES,
  channelForMode,
  type Customer,
  type GenerationMode,
  type Industry,
} from '~/types/domain'

definePageMeta({ title: '生成' })
useHead({ title: '生成 | ヨルリプ' })

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const genStore = useGenerationStore()
const customersStore = useCustomersStore()
const hashtagStore = useXPostHashtagsStore()
const historyStore = useGenerationHistoryStore()

const VALID_MODES: GenerationMode[] = [
  'general',
  'personal',
  'reply',
  'thanks',
  'public_post',
]

const MODE_META: Record<GenerationMode, { title: string; emoji: string; desc: string }> = {
  general: { title: '営業: 汎用', emoji: '📣', desc: '一斉送信向け / シーン任意' },
  personal: { title: '営業: 個人', emoji: '🎯', desc: '登録した客情報に合わせて最適化' },
  reply: { title: '単発返信', emoji: '💬', desc: '相手の文面に対する返信 (1回きり)' },
  thanks: { title: 'お礼/感謝', emoji: '🌸', desc: '来店後・同伴後のお礼' },
  public_post: { title: '公開投稿', emoji: '✨', desc: 'X タイムライン投稿' },
}

// ----- 入口処理: ?mode=... から初期化 ---------------------
const queryMode = route.query.mode as GenerationMode | undefined
const queryCustomerId =
  typeof route.query.customerId === 'string' ? route.query.customerId : null

if (!queryMode || !VALID_MODES.includes(queryMode)) {
  await navigateTo('/', { replace: true })
} else {
  // モード変更時は結果と入力をリセット
  if (genStore.mode !== queryMode) {
    genStore.mode = queryMode
    genStore.resetAll()

    // 業種からチャネルのデフォルトを決める
    // チャネル(文体スタイル)はモードから自動決定する。
    //   public_post → x_post, thanks → thanks, それ以外 → dm
    genStore.channel = channelForMode(queryMode)
  }
  // ?customerId=... が来ていれば反映 (カルテ詳細→個人営業 等)
  if (queryCustomerId) {
    genStore.customerId = queryCustomerId
  }
}

// カルテ picker 用にリストを読み込む (personal/reply/thanks 時のみ意味がある)
if (queryMode && queryMode !== 'general' && queryMode !== 'public_post') {
  await customersStore.ensureLoaded()
}

const {
  mode,
  channel,
  sceneType,
  customerId,
  customerName,
  incomingMessage,
  todayEvent,
  lengthPreference,
  affectionLevel,
  replyFlow,
  extraInstructions,
  editedCandidates,
  toolCalls,
  historyId,
  loading,
  error,
} = storeToRefs(genStore)

const meta = computed(() => (mode.value ? MODE_META[mode.value] : null))

// 定数化(template に直接書くと Vue の v-for キー処理で隣接ブロックと衝突するケースが
// あったため。明示的に別配列として参照する)
const LENGTH_PREFS = ['short', 'medium', 'long'] as const
const REPLY_FLOWS = ['continue', 'cut'] as const

// ボタンクリック時のハンドラを明示メソッド化(ref への代入が確実に行われるように)
function setLengthPref(v: (typeof LENGTH_PREFS)[number]): void {
  lengthPreference.value = v
}
function setReplyFlow(v: (typeof REPLY_FLOWS)[number]): void {
  replyFlow.value = v
}

// モード別の入力要件
const requiresCustomer = computed(
  () => mode.value === 'personal' || mode.value === 'reply' || mode.value === 'thanks',
)
const requiresIncoming = computed(() => mode.value === 'reply')
const requiresTodayEvent = computed(() => mode.value === 'thanks')
// 個人営業でも「営業したい内容」を sceneType として受け取る
const showSceneType = computed(
  () =>
    mode.value === 'general' ||
    mode.value === 'public_post' ||
    mode.value === 'personal',
)
const sceneLabel = computed(() => {
  if (mode.value === 'personal' || mode.value === 'general')
    return '営業したい内容 (任意)'
  if (mode.value === 'public_post') return '投稿のシーン (任意)'
  return 'シーン (任意)'
})
const scenePlaceholder = computed(() => {
  if (mode.value === 'personal' || mode.value === 'general')
    return '例: 久しぶりに会いたい、今度イベントあるよ、誕生日近いから来てほしい'
  if (mode.value === 'public_post')
    return '例: 出勤告知、イベント告知、新衣装お披露目'
  return '例: 出勤告知 / 久しぶりの挨拶 / イベント告知'
})

// モードに応じた sceneType の業種別テンプレ。
//   personal / general → 営業意図テンプレ
//   public_post        → 公開投稿シーンテンプレ
const salesIntentTemplates = computed<string[]>(() => {
  const ind = (userStore.industry ?? 'other') as Industry
  if (mode.value === 'personal' || mode.value === 'general') {
    return SALES_INTENT_TEMPLATES[ind] ?? []
  }
  if (mode.value === 'public_post') {
    return PUBLIC_POST_TEMPLATES[ind] ?? []
  }
  return []
})

function appendSceneType(tpl: string): void {
  const current = sceneType.value.trim()
  if (!current) {
    sceneType.value = tpl
    return
  }
  if (current.includes(tpl)) return
  sceneType.value = `${current}、${tpl}`
}

// 名前直接入力で代用可能なモード。
// 営業:個人 / 返信 / お礼 はどれも customerId が無い時に customerName で代用可。
// (個人営業は本来カルテ詳細が活きるが、未登録客でも気軽に生成できるよう許可)
const allowCustomerName = computed(
  () =>
    mode.value === 'personal' ||
    mode.value === 'reply' ||
    mode.value === 'thanks',
)

const canGenerate = computed(() => {
  if (loading.value) return false
  if (!mode.value) return false

  if (allowCustomerName.value) {
    // customerId か customerName のどちらかが必要
    if (!customerId.value.trim() && !customerName.value.trim()) return false
  }

  if (requiresIncoming.value && !incomingMessage.value.trim()) return false
  if (requiresTodayEvent.value && !todayEvent.value.trim()) return false
  return true
})

async function handleGenerate(): Promise<void> {
  if (!canGenerate.value) return
  await genStore.generate()
  // X 公開投稿モードは編集領域そのものを「投稿される最終形」にする。
  // 生成直後にアクティブな hashtag を本文末尾へ付与してしまう。
  // (この後ユーザーが textarea で自由に編集できる。チップは「次回生成時の初期 hashtags」扱い)
  appendHashtagsToCandidatesIfXPost()
}

// 候補 textarea を中身に合わせて高さフィット (内部スクロールバーを出さない)。
// `v-autosize` ディレクティブでマウント時 + 入力時に scrollHeight 同期。
const vAutosize = {
  mounted(el: HTMLTextAreaElement): void {
    const fit = (): void => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    el.addEventListener('input', fit)
    nextTick(fit)
  },
  updated(el: HTMLTextAreaElement): void {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  },
}

function appendHashtagsToCandidatesIfXPost(): void {
  if (!isXPostMode.value) return
  const suffix = hashtagSuffix.value
  if (!suffix) return
  editedCandidates.value = editedCandidates.value.map((c) =>
    c.endsWith(suffix) ? c : `${c}\n${suffix}`,
  )
}

// 業種別「今日の出来事」テンプレ
const thanksTemplates = computed<string[]>(() => {
  const ind = (userStore.industry ?? 'other') as Industry
  return THANKS_EVENT_TEMPLATES[ind] ?? []
})

// chipタップで todayEvent に追記。既に含まれていれば何もしない。
function appendTodayEvent(tpl: string): void {
  const current = todayEvent.value.trim()
  if (!current) {
    todayEvent.value = tpl
    return
  }
  if (current.includes(tpl)) return
  todayEvent.value = `${current}、${tpl}`
}

// ----- ハッシュタグ (X 公開投稿モード時のみ使用) -----------
const isXPostMode = computed(() => mode.value === 'public_post')
// 登録済みのハッシュタグ(タグ名のみ。# は含まない)
// localStorage に永続化された Pinia ストアから取得
const registeredHashtags = computed<string[]>(() => hashtagStore.tags)
// 今回の投稿で末尾に付与するタグ。デフォルトは登録済み全部 ON。
const activeHashtags = ref<Set<string>>(new Set(registeredHashtags.value))

// 「使わない」項目: 登録済みでアクティブでないもの + 提案で未 dismiss なもの
//   - 'registered': 登録済みだが今は使わない
//   - 'suggestion': まだ登録されていない提案
// UI 上は同じ chip として扱う。タップで「使う」、削除モードで永続非表示。
type InactiveItem = { tag: string; type: 'registered' | 'suggestion' }
const inactiveItems = computed<InactiveItem[]>(() => {
  const ind = (userStore.industry ?? 'other') as Industry
  const all = HASHTAG_SUGGESTIONS[ind] ?? []
  const dismissed = hashtagStore.dismissedSuggestions

  const inactiveRegistered: InactiveItem[] = registeredHashtags.value
    .filter((t) => !activeHashtags.value.has(t))
    .map((t) => ({ tag: t, type: 'registered' }))

  const undismissedSuggestions: InactiveItem[] = all
    .filter(
      (t) => !registeredHashtags.value.includes(t) && !dismissed.includes(t),
    )
    .map((t) => ({ tag: t, type: 'suggestion' }))

  return [...inactiveRegistered, ...undismissedSuggestions]
})

// 登録済みから完全削除
function unregisterHashtag(tag: string): void {
  hashtagStore.remove(tag)
  const next = new Set(activeHashtags.value)
  next.delete(tag)
  activeHashtags.value = next
}

// ----- 削除モード ----------------------------------------
const deleteMode = ref(false)

// 「使う」セクションのタップ: 通常は使わないへ移動、削除モードは登録から削除
function onActiveTap(tag: string): void {
  if (deleteMode.value) {
    unregisterHashtag(tag)
  } else {
    toggleHashtag(tag) // active から外す
  }
}

// 「使わない」セクションのタップ: 通常は登録 + active 化、削除モードは永続非表示
function onInactiveTap(item: InactiveItem): void {
  if (deleteMode.value) {
    if (item.type === 'registered') {
      unregisterHashtag(item.tag)
    } else {
      hashtagStore.dismissSuggestion(item.tag)
    }
    return
  }
  // 通常モード: 使うへ移す
  if (item.type === 'suggestion') {
    hashtagStore.add(item.tag)
  }
  const next = new Set(activeHashtags.value)
  next.add(item.tag)
  activeHashtags.value = next
}

// 「使う」セクション = active な registered タグ
const activeTags = computed(() =>
  registeredHashtags.value.filter((t) => activeHashtags.value.has(t)),
)

// 登録済みリストが変わったら active をマージ更新(ON/OFF状態は維持)
watch(
  registeredHashtags,
  (curr, prev) => {
    const prevSet = new Set(prev ?? [])
    const next = new Set<string>()
    for (const t of activeHashtags.value) {
      if (curr.includes(t)) next.add(t) // 維持
    }
    for (const t of curr) {
      if (!prevSet.has(t)) next.add(t) // 新規追加分は ON で迎え入れる
    }
    activeHashtags.value = next
  },
  { immediate: true },
)

function toggleHashtag(tag: string): void {
  const next = new Set(activeHashtags.value)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  activeHashtags.value = next
}

// 末尾に付与する文字列。空ならテキストのまま。
const hashtagSuffix = computed(() => {
  if (!isXPostMode.value) return ''
  if (activeHashtags.value.size === 0) return ''
  return Array.from(activeHashtags.value).map((t) => `#${t}`).join(' ')
})

// 候補本文 → ハッシュタグ込みの最終テキスト
function composeFinal(text: string): string {
  // X 公開投稿モードは生成時点で editedCandidates に hashtags が織り込まれているので
  // ここでは何もしない (= 二重付与を防ぐ)。
  // 他モードは hashtagSuffix が空なのでそのまま text を返す。
  return text
}

function finalText(index: number): string {
  return composeFinal(editedCandidates.value[index] ?? '')
}

// ----- コピー処理 + 自動口調学習 ----------------------------
// コピーされた瞬間の編集後文面を tone_samples に蓄積し、5件ごとに
// 背景で /api/tone/analyze を発火する。
const copiedIndex = ref<number | null>(null)
const toneStatus = ref<string | null>(null)

async function copyTo(index: number): Promise<void> {
  const text = editedCandidates.value[index]
  if (!text || !mode.value) return
  const out = composeFinal(text)

  // 1. クリップボードへ
  try {
    await navigator.clipboard.writeText(out)
    copiedIndex.value = index
    setTimeout(() => {
      if (copiedIndex.value === index) copiedIndex.value = null
    }, 1800)
  } catch (e) {
    console.warn('clipboard write failed', e)
    error.value = 'クリップボードにコピーできませんでした'
    return
  }

  // 2. 口調サンプルとして登録 + 履歴の最終コピー文を更新
  //    口調学習用には本文のみ送信(ハッシュタグはアプリ付与なので学習対象にしない)
  try {
    const res = await $fetch<{
      ok: true
      sampleCount: number
      shouldAnalyze: boolean
    }>('/api/copy-event', {
      method: 'POST',
      body: {
        channel: channel.value,
        content: text,
        historyId: historyId.value ?? undefined,
      },
    })

    // 3. 5件の閾値到達時はバックグラウンドで口調分析を起動
    if (res.shouldAnalyze) {
      toneStatus.value = '口調を学習中…'
      $fetch('/api/tone/analyze', {
        method: 'POST',
        body: { channel: channel.value },
      })
        .then(async () => {
          toneStatus.value = '口調学習を更新しました ✓'
          await userStore.fetchProfile()
          setTimeout(() => {
            toneStatus.value = null
          }, 3000)
        })
        .catch((e) => {
          console.warn('[tone analyze]', e)
          toneStatus.value = null
        })
    }
  } catch (e) {
    console.warn('[copy-event]', e)
    // コピーは成功しているのでユーザーへの目立つエラー表示はしない
  }
}

// ----- 履歴モーダル ----------------------------------------
const showHistory = ref(false)
const historyEntries = computed<HistoryEntry[]>(() =>
  mode.value ? historyStore.getByMode(mode.value) : [],
)

function openHistory(): void {
  if (!mode.value) return
  showHistory.value = true
}
function closeHistory(): void {
  showHistory.value = false
}

function loadFromHistory(entry: HistoryEntry): void {
  // 入力フィールドも復元
  sceneType.value = entry.inputs.sceneType ?? ''
  customerId.value = entry.inputs.customerId ?? ''
  customerName.value = entry.inputs.customerName ?? ''
  incomingMessage.value = entry.inputs.incomingMessage ?? ''
  todayEvent.value = entry.inputs.todayEvent ?? ''
  if (entry.inputs.lengthPreference) lengthPreference.value = entry.inputs.lengthPreference
  if (typeof entry.inputs.affectionLevel === 'number')
    affectionLevel.value = entry.inputs.affectionLevel
  if (entry.inputs.replyFlow) replyFlow.value = entry.inputs.replyFlow
  extraInstructions.value = entry.inputs.extraInstructions ?? ''

  // 候補本文を編集領域に復元
  genStore.loadCandidatesFromHistory(entry.candidates)
  // X 公開投稿モードなら hashtags を後付けして最終形にする
  // (履歴にはハッシュタグが含まれていないため、現在のチップ状態で再付与)
  appendHashtagsToCandidatesIfXPost()

  closeHistory()
}

function deleteHistoryEntry(entry: HistoryEntry): void {
  historyStore.removeEntry(entry.mode, entry.id)
}

function clearAllHistoryThisMode(): void {
  if (!mode.value) return
  if (!window.confirm('このモードの履歴を全て削除します。よろしいですか?')) return
  historyStore.clearMode(mode.value)
}

function fmtDateTime(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const m = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${m(d.getMonth() + 1)}/${m(d.getDate())} ${m(d.getHours())}:${m(d.getMinutes())}`
}

// X 公開投稿: x.com/intent/post を新タブで開く
function postToX(index: number): void {
  const text = composeFinal(editedCandidates.value[index] ?? '')
  if (!text.trim()) return
  const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

// インラインで自由テキストのハッシュタグを追加(localStorage に保存)
const newHashtagInput = ref('')
function addHashtagInline(): void {
  const added = hashtagStore.add(newHashtagInput.value)
  if (added) {
    const tag = newHashtagInput.value
      .trim()
      .replace(/^[#＃]+/, '')
      .replace(/\s+/g, '')
    const next = new Set(activeHashtags.value)
    next.add(tag)
    activeHashtags.value = next
  }
  newHashtagInput.value = ''
}

// ----- 承認カード処理 -------------------------------------
function onProposalHandled(toolUseId: string, customer?: Customer): void {
  genStore.removeToolCall(toolUseId)
  if (customer) {
    // personal/reply/thanks で新規作成カルテを即座に対象にする
    if (genStore.mode !== 'general' && genStore.mode !== 'public_post') {
      genStore.customerId = customer.id
    }
  }
}
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto">
    <header class="mb-5">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ ホーム</NuxtLink>
    </header>

    <div v-if="meta" class="mb-6 flex items-center gap-3">
      <span class="text-2xl" aria-hidden="true">{{ meta.emoji }}</span>
      <div class="flex-1 min-w-0">
        <h1 class="text-xl font-bold leading-tight">{{ meta.title }}</h1>
        <p class="mt-0.5 text-xs text-ink-400">{{ meta.desc }}</p>
      </div>
      <button
        type="button"
        class="shrink-0 inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
        @click="openHistory"
      >
        履歴
        <span
          v-if="historyEntries.length > 0"
          class="text-[10px] text-accent-soft"
        >({{ historyEntries.length }})</span>
      </button>
    </div>

    <!-- ===== 入力フォーム ===== -->
    <div class="space-y-4">
      <!-- 客 picker (personal/reply/thanks) -->
      <div v-if="requiresCustomer">
        <div class="flex items-center justify-between mb-1.5">
          <label class="text-[11px] uppercase tracking-wider text-ink-400">
            対象客
          </label>
          <NuxtLink
            to="/customers/new"
            class="text-[11px] text-accent-soft hover:text-accent"
          >+ 新規作成</NuxtLink>
        </div>

        <select
          v-model="customerId"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
          @change="customerName = ''"
        >
          <option value="">— 選択してください —</option>
          <option
            v-for="c in customersStore.list"
            :key="c.id"
            :value="c.id"
          >
            {{ c.nickname }}
          </option>
        </select>

        <!-- 返信/お礼: 未登録の客にも対応するため名前直接入力を提供 -->
        <!-- 対象客が選択されている時は名前入力欄を消す。
             未選択の時のみ表示し、入力すれば customerId を空のままで生成可能。 -->
        <template v-if="allowCustomerName && !customerId.trim()">
          <div class="my-2 flex items-center gap-2 text-[10px] text-ink-400">
            <div class="h-px bg-ink-800 flex-1" />
            <span>または名前を入力</span>
            <div class="h-px bg-ink-800 flex-1" />
          </div>
          <input
            v-model="customerName"
            type="text"
            placeholder="相手の名前を入力"
            maxlength="80"
            class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
          >
          <p class="mt-1 text-[10px] text-ink-400 leading-relaxed">
            登録なしでも名前だけ入れれば送れる文を生成できます(履歴は残らない)。
          </p>
        </template>

        <p
          v-if="customersStore.loaded && customersStore.list.length === 0 && !allowCustomerName"
          class="mt-1 text-[10px] text-amber-400/80"
        >
          お客様情報がまだありません。新規作成してから戻ってください。
        </p>
      </div>

      <!-- シーン / 営業したい内容 (general / public_post / personal) -->
      <div v-if="showSceneType">
        <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
          {{ sceneLabel }}
        </label>

        <!-- personal モード時の業種別テンプレ chip -->
        <div v-if="salesIntentTemplates.length > 0" class="flex flex-wrap gap-1.5 mb-2">
          <button
            v-for="tpl in salesIntentTemplates"
            :key="tpl"
            type="button"
            class="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-1 text-[11px] text-ink-50 transition active:scale-[.97] hover:border-accent/40"
            @click="appendSceneType(tpl)"
          >+ {{ tpl }}</button>
        </div>

        <input
          v-model="sceneType"
          type="text"
          :placeholder="scenePlaceholder"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
        >
      </div>

      <!-- 相手文面 (reply) -->
      <div v-if="requiresIncoming">
        <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
          相手から届いた文面
        </label>
        <textarea
          v-model="incomingMessage"
          rows="3"
          placeholder="返信したい相手のメッセージを貼り付け"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm leading-relaxed"
        />
      </div>

      <!-- 会話の流れ (reply) -->
      <div v-if="requiresIncoming">
        <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
          会話の流れ
        </label>
        <div class="flex gap-2">
          <button
            v-for="flow in REPLY_FLOWS"
            :key="`replyflow-${flow}`"
            type="button"
            class="flex-1 rounded-xl border px-3 py-1.5 text-xs transition"
            :class="replyFlow === flow
              ? 'border-accent text-accent-soft'
              : 'border-ink-800 text-ink-400'"
            @click="setReplyFlow(flow)"
          >
            {{ flow === 'continue' ? '会話を続ける' : '会話を切る' }}
          </button>
        </div>
        <p class="mt-1 text-[10px] text-ink-400 leading-relaxed">
          続ける = 末尾に次の話題/質問を振る / 切る = 「またね」程度で自然に結ぶ
        </p>
      </div>

      <!-- 追加で含めたい内容 (reply) -->
      <div v-if="requiresIncoming">
        <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
          追加で含めたい内容 (任意)
        </label>
        <textarea
          v-model="extraInstructions"
          rows="2"
          placeholder="例: 来週イベントあるって告知も入れて / 体調気遣う一言を入れて"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm leading-relaxed"
          maxlength="500"
        />
        <p class="mt-1 text-[10px] text-ink-400 leading-relaxed">
          返信に必ず含めたい話題・フレーズがあれば書いてください(自然に組み込まれます)。
        </p>
      </div>

      <!-- 今日の出来事 (thanks) -->
      <div v-if="requiresTodayEvent">
        <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
          今日の出来事
        </label>

        <!-- 業種別テンプレ chip: タップで追記 -->
        <div v-if="thanksTemplates.length > 0" class="flex flex-wrap gap-1.5 mb-2">
          <button
            v-for="tpl in thanksTemplates"
            :key="tpl"
            type="button"
            class="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-1 text-[11px] text-ink-50 transition active:scale-[.97] hover:border-accent/40"
            @click="appendTodayEvent(tpl)"
          >+ {{ tpl }}</button>
        </div>

        <textarea
          v-model="todayEvent"
          rows="3"
          placeholder="例: チェキ撮ってくれた、シャンパン入れてくれた、誕生日に来てくれた"
          class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm leading-relaxed"
        />
      </div>

      <!-- 長さ -->
      <div>
        <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
          長さの希望
        </label>
        <div class="flex gap-2">
          <button
            v-for="len in LENGTH_PREFS"
            :key="`length-${len}`"
            type="button"
            class="flex-1 rounded-xl border px-3 py-1.5 text-xs transition"
            :class="lengthPreference === len
              ? 'border-accent text-accent-soft'
              : 'border-ink-800 text-ink-400'"
            @click="setLengthPref(len)"
          >
            {{ len === 'short' ? '短め' : len === 'medium' ? '普通' : '長め' }}
          </button>
        </div>
      </div>

      <!-- 愛情度 -->
      <div>
        <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
          愛情度
          <span class="ml-1 text-accent-soft">{{ affectionLevel }}/10</span>
        </label>
        <input
          v-model.number="affectionLevel"
          type="range"
          min="1"
          max="10"
          step="1"
          class="w-full accent-pink-500"
          aria-label="愛情度"
        >
        <div class="mt-0.5 flex justify-between text-[11px] text-ink-400">
          <span>← 塩</span>
          <span>愛情 →</span>
        </div>
      </div>

      <!-- ハッシュタグ (X 公開投稿モード時のみ・未生成でも常時表示) -->
      <div
        v-if="isXPostMode"
        class="rounded-2xl border bg-ink-900 p-4 space-y-3 transition-colors"
        :class="deleteMode ? 'border-red-500/40' : 'border-ink-800'"
      >
        <!-- ヘッダー: タイトル + ゴミ箱トグル -->
        <div class="flex items-center justify-between">
          <p class="text-[11px] uppercase tracking-wider"
             :class="deleteMode ? 'text-red-300' : 'text-ink-400'">
            {{ deleteMode ? '削除モード (タップで削除)' : '末尾に付けるハッシュタグ' }}
          </p>
          <button
            type="button"
            class="rounded-full border w-7 h-7 flex items-center justify-center text-xs transition active:scale-[.95]"
            :class="deleteMode
              ? 'border-red-500/60 bg-red-500/10 text-red-300'
              : 'border-ink-800 text-ink-400 hover:border-red-500/40 hover:text-red-300'"
            :aria-label="deleteMode ? '削除モードを終了' : 'ハッシュタグを削除'"
            @click="deleteMode = !deleteMode"
          >
            <span v-if="deleteMode" aria-hidden="true">✓</span>
            <span v-else aria-hidden="true">🗑</span>
          </button>
        </div>

        <!-- 使う(active) -->
        <div v-if="activeTags.length > 0">
          <p class="text-[10px] text-ink-400 mb-1.5">使う</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in activeTags"
              :key="tag"
              type="button"
              class="rounded-full border px-2.5 py-1 text-[11px] transition"
              :class="deleteMode
                ? 'border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                : 'border-accent bg-accent/10 text-accent-soft'"
              @click="onActiveTap(tag)"
            >
              <span v-if="deleteMode">×</span>#{{ tag }}
            </button>
          </div>
        </div>

        <!-- 使わない(登録済み非アクティブ + 未 dismiss な提案を統合) -->
        <div v-if="inactiveItems.length > 0">
          <p class="text-[10px] text-ink-400 mb-1.5">
            使わない<span v-if="!deleteMode" class="ml-1 text-ink-400/70">(タップで使う)</span>
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="item in inactiveItems"
              :key="item.type + ':' + item.tag"
              type="button"
              class="rounded-full border px-2.5 py-1 text-[11px] transition"
              :class="deleteMode
                ? 'border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                : 'border-ink-800 text-ink-400'"
              @click="onInactiveTap(item)"
            >
              <span v-if="deleteMode">×</span>#{{ item.tag }}
            </button>
          </div>
        </div>

        <p
          v-if="activeTags.length === 0 && inactiveItems.length === 0 && !deleteMode"
          class="text-[11px] text-ink-400"
        >
          まだ登録なし。下の自由入力から追加してください。
        </p>

        <!-- 自由入力は通常モードでのみ表示 -->
        <div v-if="!deleteMode" class="flex gap-2">
          <input
            v-model="newHashtagInput"
            type="text"
            placeholder="自由入力で追加 (例: 推し活)"
            maxlength="50"
            class="flex-1 rounded-xl bg-ink-950 border border-ink-800 px-3 py-1.5 text-xs"
            @keydown.enter.prevent="addHashtagInline"
          >
          <button
            type="button"
            class="rounded-xl bg-ink-800 text-ink-50 text-xs px-3 disabled:opacity-50"
            :disabled="!newHashtagInput.trim()"
            @click="addHashtagInline"
          >+ 追加</button>
        </div>
      </div>

      <!-- 生成ボタン -->
      <button
        type="button"
        class="w-full rounded-2xl bg-accent text-ink-950 font-semibold py-3 mt-2 transition active:scale-[.99] disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canGenerate"
        @click="handleGenerate"
      >
        {{ loading ? '生成中…' : '3案生成' }}
      </button>

      <p v-if="error" class="mt-2 text-xs text-red-400 leading-relaxed">{{ error }}</p>
    </div>

    <!-- ===== 結果 ===== -->
    <div v-if="editedCandidates.length > 0" class="mt-8 space-y-3">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400">候補 (編集可)</h2>

      <div
        v-for="(c, i) in editedCandidates"
        :key="i"
        class="rounded-2xl border border-ink-800 bg-ink-900 p-4"
      >
        <textarea
          v-autosize
          v-model="editedCandidates[i]"
          class="w-full bg-transparent text-sm leading-relaxed resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-accent/40 rounded-md p-1 block"
        />

        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="text-[10px] text-ink-400 shrink-0">
            案 {{ i + 1 }} · {{ editedCandidates[i].length }}字
          </span>
          <div class="flex items-center gap-1.5">
            <button
              v-if="isXPostMode"
              type="button"
              class="rounded-full bg-sky-500 text-ink-950 text-xs font-semibold px-3 py-1 transition active:scale-[.97]"
              @click="postToX(i)"
              aria-label="X に投稿"
            >Xに投稿 ↗</button>
            <button
              type="button"
              class="rounded-full px-3 py-1 text-xs font-medium transition"
              :class="copiedIndex === i
                ? 'bg-accent/20 text-accent-soft'
                : 'bg-ink-800 text-ink-50 hover:bg-ink-800/70'"
              @click="copyTo(i)"
            >
              {{ copiedIndex === i ? 'コピー済 ✓' : 'コピー' }}
            </button>
          </div>
        </div>
      </div>

      <p
        v-if="toneStatus"
        class="text-[11px] text-accent-soft text-center"
      >
        {{ toneStatus }}
      </p>

      <div v-if="toolCalls.length > 0" class="space-y-2">
        <h2 class="text-[11px] uppercase tracking-wider text-ink-400">
          抽出された客情報の提案 ({{ toolCalls.length }})
        </h2>
        <ApprovalCard
          v-for="proposal in toolCalls"
          :key="proposal.toolUseId"
          :proposal="proposal"
          @approved="(c) => onProposalHandled(proposal.toolUseId, c)"
          @dismissed="onProposalHandled(proposal.toolUseId)"
        />
      </div>

    </div>

    <!-- ===== 履歴モーダル ===== -->
    <Teleport to="body">
      <div
        v-if="showHistory"
        class="fixed inset-0 z-50 flex flex-col bg-ink-950/95 backdrop-blur"
      >
        <!-- ヘッダー -->
        <div class="px-6 py-4 flex items-center justify-between border-b border-ink-800/60">
          <div>
            <h2 class="text-base font-bold">
              履歴
              <span v-if="meta" class="ml-1 text-xs text-ink-400">{{ meta.title }}</span>
            </h2>
            <p class="text-[10px] text-ink-400 mt-0.5">
              {{ historyEntries.length }} / {{ historyStore.MAX_PER_MODE }} 件保存中
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="historyEntries.length > 0"
              type="button"
              class="text-[11px] text-red-300/80 hover:text-red-300 px-2"
              @click="clearAllHistoryThisMode"
            >全削除</button>
            <button
              type="button"
              class="rounded-full bg-ink-800 text-ink-50 text-xs px-3 py-1.5 active:scale-[.97]"
              @click="closeHistory"
            >閉じる</button>
          </div>
        </div>

        <!-- リスト -->
        <div class="flex-1 overflow-y-auto px-6 py-4 max-w-md mx-auto w-full">
          <p
            v-if="historyEntries.length === 0"
            class="text-sm text-ink-400 leading-relaxed text-center py-12"
          >
            このモードの履歴はまだありません。<br>
            生成すると最大 {{ historyStore.MAX_PER_MODE }} 件まで自動保存されます。
          </p>

          <ul v-else class="space-y-3">
            <li
              v-for="entry in historyEntries"
              :key="entry.id"
              class="rounded-2xl border border-ink-800 bg-ink-900 p-3 space-y-2"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="text-[10px] text-ink-400 leading-tight">
                  <div>{{ fmtDateTime(entry.createdAt) }}</div>
                  <div class="mt-0.5">
                    <span v-if="entry.customerNickname" class="text-ink-50">
                      → {{ entry.customerNickname }}
                    </span>
                    <span
                      v-if="entry.inputs.sceneType"
                      class="ml-1"
                    >「{{ entry.inputs.sceneType }}」</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="text-[10px] text-red-300/70 hover:text-red-300 shrink-0"
                  @click="deleteHistoryEntry(entry)"
                >削除</button>
              </div>

              <div class="space-y-1">
                <div
                  v-for="(c, i) in entry.candidates"
                  :key="i"
                  class="rounded-md bg-ink-950 border border-ink-800/60 px-2 py-1.5 text-xs leading-relaxed whitespace-pre-wrap break-words"
                >
                  <span class="text-[9px] text-ink-400 mr-1">{{ i + 1 }}.</span>{{ c }}
                </div>
              </div>

              <button
                type="button"
                class="w-full rounded-xl bg-accent text-ink-950 text-xs font-semibold py-1.5 active:scale-[.99] transition"
                @click="loadFromHistory(entry)"
              >この結果を編集領域に呼び出す</button>
            </li>
          </ul>
        </div>
      </div>
    </Teleport>
  </section>
</template>
