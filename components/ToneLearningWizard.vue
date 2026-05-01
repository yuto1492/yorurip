<script setup lang="ts">
import { useUserStore } from '~/stores/user'
import { useToneStore } from '~/stores/tone'
import { useToneDraftStore } from '~/stores/toneDraft'

/**
 * 口調学習ウィザード (シングルステップ)。
 *
 * - 5 件のサンプル枠を提示。下書きは useToneDraftStore (Pinia + persist) で
 *   localStorage に永続化、途中離脱しても再開可能。
 * - チャネルは内部的に 'dm' 固定 (口調は単一バケットに統一されたため)。
 * - 「まとめて保存して始める」で addSamples + 5 件以上で背景 runAnalyze。
 *
 * オンボーディングと「ホーム → 口調学習」の両方から再利用される。
 */

interface Props {
  /** ヘッダー左上に表示する小ラベル(例: "ステップ 2/2" / "口調学習") */
  flowName?: string
  /** 完了 or 「終わる」時の遷移先 */
  doneRedirect?: string
}
const props = withDefaults(defineProps<Props>(), {
  flowName: '口調学習',
  doneRedirect: '/',
})

const userStore = useUserStore()
const toneStore = useToneStore()
const draftStore = useToneDraftStore()
const router = useRouter()

// 統一チャネル: tone_samples の channel カラムに保存される値 (固定)
const TONE_CHANNEL = 'dm' as const

// プレースホルダ例文 (DM / お礼 / 公開投稿 のミックス)
const PLACEHOLDERS = [
  '今日めっちゃ楽しかった〜!また来てね😊',
  '今日来てくれてほんとありがと🥹💕 チェキも撮れて嬉しかった!',
  'きてくれてありがとう〜!! またね🫶',
  '今日も◯時から出勤するよ〜🫶',
  'また絶対会いたい〜!!',
]

// ----- 各スロットの入力(下書きストアから) ------------------
const slots = computed(() => draftStore.getSlots(TONE_CHANNEL))

function updateSlot(index: number, value: string): void {
  draftStore.setSlot(TONE_CHANNEL, index, value)
}

const validCount = computed(() => draftStore.validCount(TONE_CHANNEL))

// ----- 改行貼り付け救済 -----------------------------------
function splitFromFirstSlot(): void {
  const text = slots.value[0]
  if (!text) return
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length < 2) return
  draftStore.setAllSlots(TONE_CHANNEL, lines.slice(0, 5))
}

// ----- 保存 -----------------------------------------------
const saving = ref(false)
const errorMsg = ref<string | null>(null)

async function submitAll(): Promise<void> {
  saving.value = true
  errorMsg.value = null
  try {
    const samples = draftStore.getSlots(TONE_CHANNEL)
    const valid = samples.filter((s) => s.trim().length > 0)
    if (valid.length > 0) {
      await toneStore.addSamples(TONE_CHANNEL, valid)
    }

    // 5 件以上たまっていたらバックグラウンドで分析発火
    const total = toneStore.counts[TONE_CHANNEL] ?? 0
    if (total >= 5) {
      toneStore
        .runAnalyze(TONE_CHANNEL)
        .then(() => userStore.fetchProfile())
        .catch((e) => console.warn('[tone-wizard] analyze failed:', e))
    }

    draftStore.clearAll()
    await router.replace(props.doneRedirect)
  } catch (e: unknown) {
    errorMsg.value =
      (e as { message?: string })?.message ?? '保存に失敗しました'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="px-6 py-8 max-w-md mx-auto">
    <header class="mb-5">
      <p class="text-accent text-xs font-medium tracking-wide">
        {{ props.flowName }}
      </p>
      <h1 class="mt-1 text-xl font-bold leading-tight">自分の口調を覚えさせよう!</h1>
    </header>

    <div class="space-y-3">
      <div>
        <p class="text-xs text-ink-400">
          普段送ってる文を 5 通そのまま貼り付けて。送信履歴からコピペで OK。
        </p>
        <p class="mt-2 text-[11px] text-amber-300 font-semibold">
          💡 5件で AI が口調を覚えるよ!
        </p>
      </div>

      <div class="space-y-2">
        <div
          v-for="(s, i) in slots"
          :key="i"
          class="rounded-2xl border border-ink-800 bg-ink-900 px-3 py-2"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] text-ink-400 uppercase tracking-wider">
              サンプル {{ i + 1 }}
            </span>
            <span
              v-if="i === 0 && slots[0]?.includes('\n')"
              class="text-[10px] text-accent-soft cursor-pointer underline"
              @click="splitFromFirstSlot"
            >改行で5枠に分配</span>
          </div>
          <textarea
            :value="s"
            rows="2"
            :placeholder="PLACEHOLDERS[i]"
            class="w-full bg-transparent text-sm leading-relaxed resize-y focus:outline-none"
            maxlength="2000"
            @input="updateSlot(i, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>

      <p class="text-[11px] text-ink-400">入力済み {{ validCount }} 件</p>

      <p v-if="errorMsg" class="text-xs text-red-400">{{ errorMsg }}</p>
    </div>

    <!-- ===== ボタン ===== -->
    <div class="sticky bottom-0 left-0 right-0 mt-6 -mx-6 px-6 py-3 bg-ink-950/80 backdrop-blur border-t border-ink-800/60">
      <button
        type="button"
        class="w-full rounded-2xl bg-accent text-ink-950 font-semibold py-3 disabled:opacity-50 transition active:scale-[.99]"
        :disabled="saving"
        @click="submitAll"
      >
        <template v-if="saving">保存中…</template>
        <template v-else>まとめて保存して始める ({{ validCount }}件)</template>
      </button>

      <p class="mt-2 text-[10px] text-ink-400">
        💡 自動保存。途中で抜けても続きから OK。
      </p>
    </div>
  </section>
</template>
