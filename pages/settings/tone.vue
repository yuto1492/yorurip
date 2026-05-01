<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToneStore } from '~/stores/tone'
import { useUserStore } from '~/stores/user'
import type { ToneFeatures, ToneFeatureSet, ToneSample } from '~/types/domain'

definePageMeta({
  title: '口調学習',
  pageTransition: { name: 'slide-left', mode: 'out-in', appear: false },
})
useHead({ title: '口調学習 | ヨルリプ' })

const toneStore = useToneStore()
const userStore = useUserStore()
const { samplesByChannel, counts } = storeToRefs(toneStore)

// 学習に必要なサンプル数の下限。これ未満では業種ペルソナのみで生成される。
const MIN_SAMPLES = 5

// 口調は単一バケットに統一: tone_samples.channel = 'dm' のみ使う。
// (DB スキーマ上は他チャネル ('x_post' / 'thanks') も存在するが、UI からは触らない)
const TONE_CHANNEL = 'dm' as const

onMounted(() => {
  toneStore.fetchSamples(TONE_CHANNEL).catch((e) =>
    console.warn('[settings/tone] initial fetch failed:', e),
  )
})

// ----- 既存サンプル ---------------------------------------
const existingSamples = computed<ToneSample[]>(
  () => samplesByChannel.value[TONE_CHANNEL] ?? [],
)
const sampleCount = computed(() => counts.value[TONE_CHANNEL] ?? 0)
const canDelete = computed(() => sampleCount.value >= MIN_SAMPLES)

// ----- インライン編集 + 自動保存 (blur 時) -------------------
const editBuffers = ref<Record<string, string>>({})

watch(
  existingSamples,
  (list) => {
    const next: Record<string, string> = {}
    for (const s of list) next[s.id] = s.content
    editBuffers.value = next
  },
  { immediate: true },
)

const flashMsg = ref<string | null>(null)
function flash(text: string, ms = 2000): void {
  flashMsg.value = text
  setTimeout(() => {
    if (flashMsg.value === text) flashMsg.value = null
  }, ms)
}

async function autoSaveEdit(s: ToneSample): Promise<void> {
  const next = (editBuffers.value[s.id] ?? '').trim()
  if (!next || next === s.content) return
  try {
    await toneStore.updateSample(TONE_CHANNEL, s.id, next)
    flash('編集を保存しました ✓')
  } catch (e) {
    console.warn('autoSaveEdit failed', e)
    flash((e as { message?: string })?.message ?? '保存に失敗しました', 3000)
  }
}

// ----- 削除 (5件以上ある時のみ) ------------------------------
const deletingId = ref<string | null>(null)
async function removeSample(s: ToneSample): Promise<void> {
  if (!canDelete.value) return
  if (!window.confirm('このサンプルを削除します。よろしいですか?')) return
  deletingId.value = s.id
  try {
    await toneStore.deleteSample(TONE_CHANNEL, s.id)
    flash('削除しました')
  } catch (e) {
    console.warn('delete sample failed', e)
    flash((e as { message?: string })?.message ?? '削除に失敗しました', 3000)
  } finally {
    deletingId.value = null
  }
}

// ----- 口調追加モーダル -------------------------------------
const showAddModal = ref(false)
const addModalText = ref('')
const adding = ref(false)
const addError = ref<string | null>(null)

function openAddModal(): void {
  addModalText.value = ''
  addError.value = null
  showAddModal.value = true
}

async function submitAddSample(): Promise<void> {
  const text = addModalText.value.trim()
  if (!text || adding.value) return
  adding.value = true
  addError.value = null
  try {
    const prevCount = sampleCount.value
    const added = await toneStore.addSamples(TONE_CHANNEL, [text])
    const newCount = prevCount + added
    showAddModal.value = false
    addModalText.value = ''
    flash(`サンプルを追加しました (合計 ${newCount} 件)`)

    // 5件以上揃った時 + 5の倍数到達タイミングで分析を発火 (copy-event と同じルール)。
    //   prevCount=4, newCount=5 → trigger (初回到達)
    //   prevCount=9, newCount=10 → trigger
    //   prevCount=10, newCount=11 → no
    const crossed5Boundary =
      Math.floor(newCount / 5) > Math.floor(prevCount / 5)
    if (newCount >= MIN_SAMPLES && crossed5Boundary) {
      runAnalyzeInBackground()
    }
  } catch (e: unknown) {
    addError.value =
      (e as { message?: string })?.message ?? '追加に失敗しました'
  } finally {
    adding.value = false
  }
}

/**
 * 分析をバックグラウンドで走らせる共通ロジック。
 * (modal 追加時の自動発火と、手動「今すぐ学習」ボタンの両方から使う)
 */
const manualAnalyzing = ref(false)
const supabaseUser = useSupabaseUser()

async function runAnalyzeInBackground(): Promise<void> {
  if (manualAnalyzing.value) return

  // セッション無し (匿名サインインがまだ走ってない / 失敗) なら早期返し。
  // 401 を Console に出さないため事前チェック。
  if (!supabaseUser.value) {
    flash('ログイン情報がありません。ページを再読み込みしてください。', 5000)
    return
  }

  manualAnalyzing.value = true
  flash('口調を学習中…', 8000)
  try {
    // 念のため最新の DB 状態を再フェッチして、画面表示と DB のズレを検出
    await toneStore.fetchSamples(TONE_CHANNEL)
    const localCount = sampleCount.value

    // 画面上ですでに 5 件未満なら、API を叩かずに早期返し
    if (localCount < MIN_SAMPLES) {
      flash(
        `サンプルは現在 ${localCount} 件です。学習には ${MIN_SAMPLES} 件以上必要です。`,
        4000,
      )
      return
    }

    const res = await toneStore.runAnalyze(TONE_CHANNEL)
    if (res.ok) {
      await userStore.fetchProfile()
      flash(`口調学習を更新しました ✓ (${res.sampleCount} 件のサンプルから抽出)`, 3000)
    } else if (res.reason === 'unauthorized') {
      flash(
        'セッションが切れました。ページを再読み込みすると復旧します。',
        6000,
      )
    } else if (res.reason === 'not enough samples') {
      // 画面では足りているのにサーバ側で見えない = 認証 or 別チャネルの可能性
      flash(
        `❌ 食い違い: 画面では ${localCount} 件ありますが、サーバ側は ${res.sampleCount} 件しか見えていません。チャネルを確認するか、ページをリロードしてみてください。`,
        9000,
      )
      console.warn('[tone analyze] mismatch', {
        channel: TONE_CHANNEL,
        localCount,
        serverCount: res.sampleCount,
      })
    } else if (res.reason && res.reason !== 'busy') {
      flash(res.reason, 4000)
    } else {
      flash('分析できませんでした', 3000)
    }
  } catch (e: unknown) {
    console.warn('[tone analyze]', e)
    flash((e as { message?: string })?.message ?? '分析に失敗しました', 4000)
  } finally {
    manualAnalyzing.value = false
  }
}

function fmtDate(s: string): string {
  return s.slice(0, 10)
}

// ----- AI が学習した口調特徴の表示 ---------------------------
const toneFeatures = computed<ToneFeatureSet | null>(() => {
  const features = userStore.profile?.tone_features as ToneFeatures | null
  return features?.byChannel?.[TONE_CHANNEL] ?? null
})

const lastAnalyzedAt = computed<string | null>(() => {
  const features = userStore.profile?.tone_features as ToneFeatures | null
  return features?.updatedAt ?? null
})

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const m = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${m(d.getMonth() + 1)}/${m(d.getDate())} ${m(d.getHours())}:${m(d.getMinutes())}`
}

// ----- デバッグ表示: DB に保存されている生 JSON + プロンプト挿入形 ---
const showDebug = ref(false)

const debugJson = computed<string>(() => {
  const set = toneFeatures.value
  if (!set) return '(まだ未学習)'
  return JSON.stringify(set, null, 2)
})

/**
 * server/utils/prompts/index.ts の renderToneFeatures と同じロジックを
 * クライアント側で再現してプレビュー表示する (実際の生成プロンプトに
 * 注入される形式そのまま)。3 層構造 (PROMPTS.md [5]) に対応。
 */
const promptPreview = computed<string>(() => {
  const set = toneFeatures.value
  const samples = existingSamples.value

  if (set?.structuralFeatures && set?.judgedFeatures) {
    const blocks: string[] = []
    const sf = set.structuralFeatures
    const jf = set.judgedFeatures

    blocks.push(
      [
        '[口調の構造的特徴]',
        `- 平均文長: ${sf.avgLength} 字`,
        `- 1メッセージの平均文数: ${sf.avgSentencePerMessage}`,
        `- 絵文字密度: ${sf.emojiDensity} (${sf.emojiDensityNote})`,
        `- 改行スタイル: ${sf.lineBreakStyle}`,
        `- 頻出語尾: ${sf.frequentEndings.join(' / ')}`,
        `- 頻出絵文字: ${sf.frequentEmojis.join(' / ')}`,
        `- 頻出記号: ${sf.frequentPunctuation.join(' / ')}`,
        `- 一人称: ${sf.firstPerson}`,
      ].join('\n'),
    )

    blocks.push(
      [
        '[口調の判定特徴]',
        `- 方言: ${jf.dialect} (適用度: ${jf.dialectIntensity})`,
        jf.dialectExamples.length > 0
          ? `  - 方言例: ${jf.dialectExamples.join(' / ')}`
          : null,
        `- キャラ: ${jf.characterStyle} — ${jf.characterStyleNote}`,
        `- 文体ベース: ${jf.speechBase}`,
        `- 顧客への呼称傾向: ${jf.callPattern}`,
        '- 特徴的な癖:',
        ...jf.characteristicPhrases.map((p) => `  - ${p}`),
      ]
        .filter((l): l is string => l !== null)
        .join('\n'),
    )

    if (set.exampleSamples && set.exampleSamples.length > 0) {
      const exLines: string[] = [
        '[ユーザーの過去の文面例]',
        'これらはユーザーが実際に書いた文面である。',
        '文体・語彙・絵文字使い・方言の混ぜ方を真似て生成すること。',
        '',
      ]
      set.exampleSamples.forEach((ex, i) => {
        exLines.push(`例${i + 1} (${ex.contextLabel}):`)
        exLines.push('"""')
        exLines.push(ex.text)
        exLines.push('"""')
        exLines.push('')
      })
      exLines.push(
        '[口調再現の優先順位]',
        '1. 上の過去文面例から直接パターンを学んで真似る (最優先)',
        '2. 上の判定特徴 (方言/キャラ等) を踏まえる',
        '3. 上の構造的特徴 (文長/絵文字密度等) を満たす',
        '4. 業種ペルソナの一般的傾向 (最も低優先・矛盾時はユーザー口調を優先)',
      )
      blocks.push(exLines.join('\n'))
    }

    return blocks.join('\n\n')
  }

  // 未分析時は最近のサンプル 3 件を渡す (server 側 fallback と同じ)
  const recent = samples.slice(0, 3)
  if (recent.length === 0) return '(未学習: tone_features 無し / サンプル無し)'
  const lines: string[] = ['[最近のあなたの文面サンプル(口調を寄せる参考)]']
  recent.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.content}`)
  })
  return (
    lines.join('\n') +
    '\n\n(※ 5 件以上溜めて分析すると 3 層構造の特徴 + Few-shot に置き換わります)'
  )
})

async function copyDebug(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    flash('コピーしました ✓')
  } catch (e) {
    console.warn('clipboard failed', e)
  }
}
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto pb-12">
    <header class="mb-5 flex items-center justify-between">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ ホーム</NuxtLink>
    </header>

    <h1 class="text-xl font-bold mb-1">口調学習</h1>
    <p class="text-xs text-ink-400 mb-4">普段送ってる文を貼ると AI が真似してくれる。</p>

    <!-- サマリ + 5件最低要件 ガイド -->
    <div class="rounded-xl border bg-ink-900 px-4 py-3 mb-3 transition-colors"
      :class="sampleCount >= MIN_SAMPLES ? 'border-accent/30' : 'border-amber-400/30'"
    >
      <div class="text-xs flex items-center justify-between gap-2">
        <div class="font-medium">
          口調サンプル <span class="text-ink-50">{{ sampleCount }}</span><span class="text-ink-400"> / 最低 {{ MIN_SAMPLES }} 件</span>
        </div>
        <span
          v-if="sampleCount >= MIN_SAMPLES"
          class="text-[10px] rounded-full border border-accent/40 px-2 py-0.5 text-accent-soft"
        >学習中 ✓</span>
        <span
          v-else
          class="text-[10px] rounded-full border border-amber-400/40 px-2 py-0.5 text-amber-300"
        >未学習</span>
      </div>
      <p
        v-if="sampleCount >= MIN_SAMPLES"
        class="mt-1.5 text-[11px] text-ink-400"
      >✓ AI が口調を真似してくれる状態</p>
      <p
        v-else
        class="mt-1.5 text-[11px] text-amber-300/90"
      >
        あと <strong class="text-ink-50">{{ MIN_SAMPLES - sampleCount }} 件</strong> で学習スタート
      </p>
    </div>

    <!-- AI が覚えた口調 -->
    <section class="mb-4 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <div class="flex items-center justify-between gap-2 mb-2">
        <h2 class="text-[11px] uppercase tracking-wider text-ink-400">
          🤖 AI が覚えた口調
        </h2>
        <button
          v-if="sampleCount >= MIN_SAMPLES"
          type="button"
          class="text-[10px] rounded-full border border-accent/40 bg-accent/5 text-accent-soft px-2 py-0.5 hover:bg-accent/10 disabled:opacity-50 active:scale-[.97] transition"
          :disabled="manualAnalyzing"
          @click="runAnalyzeInBackground"
        >{{ manualAnalyzing ? '学習中…' : '今すぐ学習' }}</button>
      </div>
      <p
        v-if="lastAnalyzedAt"
        class="text-[10px] text-ink-400/80 mb-2"
      >最終更新: {{ fmtDateTime(lastAnalyzedAt) }}</p>

      <p v-if="!toneFeatures" class="text-xs text-ink-400">
        まだ未学習。
        <span v-if="sampleCount < MIN_SAMPLES" class="text-amber-300/90">
          あと {{ MIN_SAMPLES - sampleCount }} 件で開始
        </span>
      </p>

      <dl v-else class="space-y-2 text-xs">
        <!-- 層1: 構造的特徴 -->
        <template v-if="toneFeatures.structuralFeatures">
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">よく使う語尾</dt>
            <dd class="flex-1 flex flex-wrap gap-1">
              <span
                v-for="e in toneFeatures.structuralFeatures.frequentEndings"
                :key="e"
                class="rounded-full border border-ink-800 bg-ink-950 px-2 py-0.5 text-[11px]"
              >{{ e }}</span>
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">頻出絵文字</dt>
            <dd class="flex-1 flex flex-wrap gap-1">
              <span
                v-for="e in toneFeatures.structuralFeatures.frequentEmojis"
                :key="e"
                class="rounded-full border border-ink-800 bg-ink-950 px-2 py-0.5 text-[11px]"
              >{{ e }}</span>
            </dd>
          </div>
          <div
            v-if="toneFeatures.structuralFeatures.frequentPunctuation.length > 0"
            class="flex gap-3"
          >
            <dt class="text-ink-400 w-24 shrink-0">特徴的な記号</dt>
            <dd class="flex-1 flex flex-wrap gap-1">
              <span
                v-for="p in toneFeatures.structuralFeatures.frequentPunctuation"
                :key="p"
                class="rounded-full border border-ink-800 bg-ink-950 px-2 py-0.5 text-[11px]"
              >{{ p }}</span>
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">絵文字密度</dt>
            <dd class="flex-1">
              {{ toneFeatures.structuralFeatures.emojiDensity }}
              <span class="text-ink-400/80">— {{ toneFeatures.structuralFeatures.emojiDensityNote }}</span>
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">平均文長</dt>
            <dd class="flex-1">{{ toneFeatures.structuralFeatures.avgLength }} 字 / メッセージ ({{ toneFeatures.structuralFeatures.avgSentencePerMessage }} 文)</dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">改行スタイル</dt>
            <dd class="flex-1">{{ toneFeatures.structuralFeatures.lineBreakStyle }}</dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">一人称</dt>
            <dd class="flex-1">{{ toneFeatures.structuralFeatures.firstPerson }}</dd>
          </div>
        </template>

        <!-- 層2: 判定特徴 -->
        <template v-if="toneFeatures.judgedFeatures">
          <div class="pt-1.5 border-t border-ink-800 flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">方言</dt>
            <dd class="flex-1">
              {{ toneFeatures.judgedFeatures.dialect }} ({{ toneFeatures.judgedFeatures.dialectIntensity }})
              <span
                v-if="toneFeatures.judgedFeatures.dialectExamples.length > 0"
                class="text-ink-400/80"
              >
                — 例: {{ toneFeatures.judgedFeatures.dialectExamples.join(' / ') }}
              </span>
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">キャラ</dt>
            <dd class="flex-1">
              {{ toneFeatures.judgedFeatures.characterStyle }}
              <span class="text-ink-400/80">— {{ toneFeatures.judgedFeatures.characterStyleNote }}</span>
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">文体ベース</dt>
            <dd class="flex-1">{{ toneFeatures.judgedFeatures.speechBase }}</dd>
          </div>
          <div class="flex gap-3">
            <dt class="text-ink-400 w-24 shrink-0">呼称傾向</dt>
            <dd class="flex-1">{{ toneFeatures.judgedFeatures.callPattern }}</dd>
          </div>
          <div class="pt-1.5 border-t border-ink-800">
            <dt class="text-ink-400 mb-1">特徴的な癖</dt>
            <dd>
              <ul class="list-disc list-inside space-y-0.5 text-ink-50">
                <li
                  v-for="p in toneFeatures.judgedFeatures.characteristicPhrases"
                  :key="p"
                >{{ p }}</li>
              </ul>
            </dd>
          </div>
        </template>

        <!-- 層3: Few-shot サンプル -->
        <div
          v-if="toneFeatures.exampleSamples && toneFeatures.exampleSamples.length > 0"
          class="pt-1.5 border-t border-ink-800"
        >
          <dt class="text-ink-400 mb-1.5">
            選ばれた Few-shot 例 ({{ toneFeatures.exampleSamples.length }} 件)
          </dt>
          <dd class="space-y-2">
            <div
              v-for="(ex, i) in toneFeatures.exampleSamples"
              :key="i"
              class="rounded-lg bg-ink-950 border border-ink-800 p-2"
            >
              <div class="flex items-center gap-2 text-[10px] text-ink-400 mb-1">
                <span class="rounded px-1 border border-ink-800">{{ ex.contextLabel }}</span>
                <span class="text-ink-400/70">{{ ex.channel }}</span>
              </div>
              <p class="text-[11px] whitespace-pre-wrap break-words">{{ ex.text }}</p>
              <p class="mt-1 text-[10px] text-ink-400/80 italic">
                → {{ ex.characteristicReason }}
              </p>
            </div>
          </dd>
        </div>
      </dl>
    </section>

    <!-- 🔧 デバッグ: 実際に保存されている生データ + プロンプト挿入形を表示 -->
    <section class="mb-4 rounded-2xl border border-ink-800/60 bg-ink-950 px-4 py-3">
      <button
        type="button"
        class="w-full flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-400 hover:text-ink-50 transition"
        @click="showDebug = !showDebug"
      >
        <span>🔧 デバッグ (保存されている生データ)</span>
        <span aria-hidden="true">{{ showDebug ? '▾' : '▸' }}</span>
      </button>

      <div v-if="showDebug" class="mt-3 space-y-3">
        <!-- 1. tone_features の生 JSON -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-[10px] uppercase tracking-wider text-ink-400">
              tone_features.byChannel.dm (DB の生 JSON)
            </h3>
            <button
              type="button"
              class="text-[10px] text-accent-soft underline"
              @click="copyDebug(debugJson)"
            >コピー</button>
          </div>
          <pre class="text-[10px] text-ink-50 bg-ink-900 border border-ink-800 rounded-md p-2 overflow-auto whitespace-pre-wrap break-all max-h-64">{{ debugJson }}</pre>
        </div>

        <!-- 2. 実際のプロンプト挿入形 -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-[10px] uppercase tracking-wider text-ink-400">
              生成プロンプトに注入される形式
            </h3>
            <button
              type="button"
              class="text-[10px] text-accent-soft underline"
              @click="copyDebug(promptPreview)"
            >コピー</button>
          </div>
          <pre class="text-[10px] text-accent-soft bg-ink-900 border border-ink-800 rounded-md p-2 overflow-auto whitespace-pre-wrap break-all max-h-64">{{ promptPreview }}</pre>
        </div>

        <!-- 3. 生サンプル一覧 (DB の tone_samples 行そのもの) -->
        <div v-if="existingSamples.length > 0">
          <h3 class="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
            tone_samples 行 (DB 上、新しい順 {{ existingSamples.length }} 件)
          </h3>
          <pre class="text-[10px] text-ink-50 bg-ink-900 border border-ink-800 rounded-md p-2 overflow-auto whitespace-pre-wrap break-all max-h-64">{{ JSON.stringify(existingSamples.map(s => ({ id: s.id, source: s.source, created_at: s.created_at, content: s.content })), null, 2) }}</pre>
        </div>

        <p class="text-[10px] text-ink-400/80 leading-relaxed">
          ※ 上記は実際のサーバ側コード (`server/utils/prompts/index.ts` の <code class="text-ink-50">renderToneFeatures</code>) と同じロジックで構築されています。生成リクエスト時にこの文字列がそのままプロンプトの「あなた自身のプロフィール」セクションに注入されます。
        </p>
      </div>
    </section>

    <!-- 追加ボタン -->
    <button
      type="button"
      class="w-full rounded-xl border border-dashed border-accent/50 bg-accent/5 text-accent-soft text-sm py-2.5 mb-4 hover:bg-accent/10 active:scale-[.99] transition"
      @click="openAddModal"
    >+ 文を追加</button>

    <p
      v-if="flashMsg"
      class="text-[11px] text-accent-soft text-center mb-3"
    >{{ flashMsg }}</p>

    <!-- 口調サンプル -->
    <section v-if="existingSamples.length > 0" class="mb-6">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">
        登録済みの文 ({{ existingSamples.length }} 件)
      </h2>
      <ul class="space-y-2">
        <li
          v-for="s in existingSamples"
          :key="s.id"
          class="rounded-2xl border border-ink-800 bg-ink-900 p-3"
        >
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="text-[10px] text-ink-400 flex items-center gap-2">
              <span>{{ fmtDate(s.created_at) }}</span>
              <span class="rounded px-1 border border-ink-800">
                {{ s.source === 'auto_edited' ? '自動収集' : '手動' }}
              </span>
            </div>
            <button
              v-if="canDelete"
              type="button"
              class="text-[11px] text-red-300/80 hover:text-red-300 disabled:opacity-50"
              :disabled="deletingId === s.id"
              @click="removeSample(s)"
            >{{ deletingId === s.id ? '削除中…' : '削除' }}</button>
          </div>
          <textarea
            v-model="editBuffers[s.id]"
            rows="2"
            class="w-full bg-transparent text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent/40 rounded-md p-1"
            maxlength="2000"
            @blur="autoSaveEdit(s)"
          />
        </li>
      </ul>
      <p v-if="!canDelete" class="mt-2 text-[10px] text-ink-400/80">
        ※ タップで編集 (自動保存)。削除は {{ MIN_SAMPLES }} 件以上のときだけ。
      </p>
      <p v-else class="mt-2 text-[10px] text-ink-400/80">
        ※ タップで編集 (自動保存)。
      </p>
    </section>

    <p v-else class="text-sm text-ink-400 text-center py-8">
      まだ無いよ。上の <strong>+ 文を追加</strong> から貼ってね。
    </p>

    <!-- 追加モーダル -->
    <Teleport to="body">
      <div
        v-if="showAddModal"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/70 backdrop-blur-sm"
        @click.self="showAddModal = false"
      >
        <div class="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-ink-900 border border-ink-800 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold">文を追加</h2>
            <button
              type="button"
              class="rounded-full bg-ink-800 text-ink-50 text-xs px-3 py-1 active:scale-[.97]"
              @click="showAddModal = false"
            >キャンセル</button>
          </div>

          <p class="text-[11px] text-ink-400">
            普段送ってる文をそのまま貼り付け (絵文字・改行 OK)。
            <span v-if="sampleCount < MIN_SAMPLES" class="text-amber-300/90">あと {{ MIN_SAMPLES - sampleCount }} 件で学習スタート。</span>
          </p>

          <textarea
            v-model="addModalText"
            rows="4"
            placeholder="例: 今日めっちゃ楽しかった〜!また来てね😊"
            class="w-full rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm leading-relaxed"
            maxlength="2000"
          />

          <p v-if="addError" class="text-xs text-red-400">{{ addError }}</p>

          <button
            type="button"
            class="w-full rounded-xl bg-accent text-ink-950 font-semibold py-2.5 active:scale-[.99] disabled:opacity-50"
            :disabled="adding || !addModalText.trim()"
            @click="submitAddSample"
          >{{ adding ? '追加中…' : '追加する' }}</button>
        </div>
      </div>
    </Teleport>
  </section>
</template>
