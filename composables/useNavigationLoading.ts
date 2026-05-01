/**
 * ページ遷移中のフルスクリーンローダー状態を共有する composable。
 *
 * - `start()` 呼び出し時に 150ms の遅延後に loading を立てる (短い遷移で
 *   ローダーがチラつくのを防ぐ)
 * - `stop()` で即座に loading を倒す
 *
 * ページ遷移と同期するため `plugins/navigation-loading.client.ts` で
 * Nuxt の `page:start` / `page:finish` フックに紐付けてある。
 */

const SHOW_DELAY_MS = 150

const isLoading = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

export function useNavigationLoading() {
  function start(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      isLoading.value = true
    }, SHOW_DELAY_MS)
  }

  function stop(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    isLoading.value = false
  }

  return {
    isLoading: readonly(isLoading),
    start,
    stop,
  }
}
