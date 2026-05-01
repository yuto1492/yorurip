<script setup lang="ts">
/**
 * 初回アクセス時の機能紹介ページ。
 * オンボーディング (/onboarding) より手前に挟む。
 *
 * フロー: アクセス → /welcome (このページ) → /onboarding → ホーム
 *
 * 「2 回目以降は表示しない」フラグは localStorage に保存。
 * 中身は middleware/onboarding.global.ts で参照する。
 */

definePageMeta({
  title: 'ヨルリプとは',
  pageTransition: { name: 'slide-left', mode: 'out-in', appear: false },
})
useHead({ title: 'ヨルリプとは | ヨルリプ' })

const router = useRouter()

const WELCOME_SEEN_KEY = 'yorurip.welcome_seen'

const features = [
  {
    emoji: '💬',
    title: '返信 / 営業/ お礼を AI が 3 案',
    desc: '相手や状況に合わせて 3 パターン提案。気に入ったやつをコピペして送るだけ。',
  },
  {
    emoji: '🗨️',
    title: '客との会話を覚えてくれる',
    desc: '客ごとに継続スレッド。前のやり取りを踏まえて自然な返信を作ってくれる。',
  },
  {
    emoji: '✨',
    title: 'あなたの口調を学習',
    desc: '普段送ってる文を 5 件貼ると、AI が真似して書いてくれる。',
  },
  {
    emoji: '🎯',
    title: '客情報を管理',
    desc: 'タイプ・好み・チェキ枚数等を記録。営業の精度が上がる。',
  },
]

const submitting = ref(false)

async function start(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, '1')
  } catch {
    /* localStorage 不可環境でも進める */
  }
  await router.replace('/onboarding')
}
</script>

<template>
  <section class="min-h-[100dvh] flex flex-col px-6 py-10 max-w-md mx-auto">
    <!-- Hero -->
    <header class="mb-8 text-center">
      <p class="text-accent text-xs font-medium tracking-widest mb-1">YORURIP</p>
      <h1 class="text-3xl font-bold leading-tight">
        あなたの口調で<br>
        あなたの変わりにAIが返信
      </h1>
      <p class="mt-3 text-xs text-ink-400 leading-relaxed">
        営業文面、3 秒で 3 案。
      </p>
    </header>

    <!-- 機能カード -->
    <div class="flex-1 space-y-3 mb-6">
      <div
        v-for="f in features"
        :key="f.title"
        class="rounded-2xl border border-ink-800 bg-ink-900 p-4 flex gap-3"
      >
        <span class="text-2xl shrink-0" aria-hidden="true">{{ f.emoji }}</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold mb-0.5">{{ f.title }}</h2>
          <p class="text-[11px] text-ink-400 leading-relaxed">{{ f.desc }}</p>
        </div>
      </div>
    </div>

    <!-- 始める -->
    <div class="sticky bottom-0 -mx-6 px-6 pt-3 pb-6 bg-ink-950/85 backdrop-blur border-t border-ink-800/60">
      <button
        type="button"
        class="w-full rounded-2xl bg-accent text-ink-950 font-semibold py-3.5 disabled:opacity-50 transition active:scale-[.99]"
        :disabled="submitting"
        @click="start"
      >{{ submitting ? '起動中…' : '始める' }}</button>
      <p class="mt-2 text-[10px] text-ink-400 text-center leading-relaxed">
        無料・ゲストモードで即スタート (登録不要)
      </p>
    </div>
  </section>
</template>
