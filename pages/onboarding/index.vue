<script setup lang="ts">
import { INDUSTRY_OPTIONS, type Industry } from '~/types/domain'
import { useUserStore } from '~/stores/user'

definePageMeta({
  title: '業種選択',
  // オンボーディング進入時の左スライド演出 (初回ロードでは appear:false なので発火しない)
  pageTransition: { name: 'slide-left', mode: 'out-in', appear: false },
})
useHead({ title: 'はじめに | ヨルリプ' })

const userStore = useUserStore()
const router = useRouter()

const submitting = ref<Industry | null>(null)
const errorMessage = ref<string | null>(null)

// onboarded ユーザーをホームに戻す責務は middleware に任せる。
// 以前ここに watch(isOnboarded) を置いていたが、pick() の router.replace と
// 競合して二重ナビゲーションになり、URL は /onboarding/tone に遷移するのに
// 描画は /onboarding のまま残る不具合を起こしていた。

async function pick(industry: Industry) {
  if (submitting.value) return
  submitting.value = industry
  errorMessage.value = null
  try {
    await userStore.createProfile(industry)
    // 続いて源氏名入力 → 口調訓練(両方とも任意・スキップ可)
    await router.replace('/onboarding/genji')
  } catch (e: any) {
    // Postgres の制約違反は分かりにくいので翻訳して表示
    const raw = e?.message ?? ''
    if (/check constraint|violates check/i.test(raw)) {
      errorMessage.value =
        '業種マスターが古いままです。Supabase Dashboard でマイグレーション 0004 / 0005 を実行してください。'
    } else if (/duplicate key|unique constraint/i.test(raw)) {
      errorMessage.value =
        '既にプロファイルがあるようです。ページをリロードしてください。'
    } else {
      errorMessage.value = raw || '保存に失敗しました'
    }
  } finally {
    submitting.value = null
  }
}
</script>

<template>
  <section class="px-6 py-12 max-w-md mx-auto">
    <header class="mb-8">
      <p class="text-accent text-xs font-medium tracking-wide">ステップ 1/3</p>
      <h1 class="mt-1 text-2xl font-bold leading-tight">
        どこで働いてる?
      </h1>
      <p class="mt-3 text-[11px] text-amber-300/80 leading-relaxed">
        現在<strong>コンカフェ</strong>機能がメインで、他業種は調整中です
      </p>
    </header>

    <div
      v-if="errorMessage"
      class="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 leading-relaxed"
    >
      <strong>エラー:</strong>
      {{ errorMessage }}
    </div>

    <ul class="space-y-2.5">
      <li v-for="opt in INDUSTRY_OPTIONS" :key="opt.value">
        <button
          type="button"
          class="w-full text-left rounded-2xl border border-ink-800 bg-ink-900 px-4 py-4 transition active:scale-[.99] disabled:opacity-50"
          :class="opt.value === 'concafe' ? 'border-accent/40 bg-ink-900/80 ring-1 ring-accent/20' : ''"
          :disabled="!!submitting"
          @click="pick(opt.value)"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-semibold flex items-center gap-2">
                {{ opt.label }}
                <span
                  v-if="!opt.stable"
                  class="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border border-amber-400/40 text-amber-300/90 font-medium"
                >
                  開発中
                </span>
              </div>
              <p v-if="opt.value === 'concafe'" class="mt-0.5 text-xs text-accent-soft">
                X DM / 公開投稿の生成に最適化(女性キャスト・メイドカフェ系)
              </p>
              <p v-else-if="opt.value === 'menkon'" class="mt-0.5 text-xs text-ink-400">
                X DM / 公開投稿(男性キャスト・執事系含む)
              </p>
              <p v-else-if="opt.value === 'kyaba'" class="mt-0.5 text-xs text-ink-400">
                LINE中心 / 同伴・アフター対応
              </p>
              <p v-else-if="opt.value === 'host'" class="mt-0.5 text-xs text-ink-400">
                LINE中心 / 姫呼び・シャンパン営業
              </p>
              <p v-else-if="opt.value === 'fuzoku'" class="mt-0.5 text-xs text-ink-400">
                LINE / 写メ日記
              </p>
              <p v-else-if="opt.value === 'bar_female'" class="mt-0.5 text-xs text-ink-400">
                LINE / 砕け敬語・常連化
              </p>
              <p v-else-if="opt.value === 'bar_male'" class="mt-0.5 text-xs text-ink-400">
                LINE / 落ち着いた敬語・季節入荷案内
              </p>
              <p v-else class="mt-0.5 text-xs text-ink-400">
                それ以外の接客業
              </p>
            </div>
            <span v-if="submitting === opt.value" class="text-ink-400 text-xs">保存中…</span>
            <span v-else aria-hidden="true" class="text-ink-400">›</span>
          </div>
        </button>
      </li>
    </ul>

  </section>
</template>
