/**
 * ページ遷移中のローディングオーバーレイ表示用フック。
 *
 * Nuxt 3 の `page:start` は遷移開始 (async setup が走り始める) 時、
 * `page:finish` は target ページの setup が完了して描画準備できた時に発火する。
 * これに合わせて `useNavigationLoading()` の start/stop を呼ぶ。
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { start, stop } = useNavigationLoading()
  nuxtApp.hook('page:start', start)
  nuxtApp.hook('page:finish', stop)
  // page:loading:end は エラー発生時にも fire する保険的フック
  nuxtApp.hook('page:loading:end', stop)
})
