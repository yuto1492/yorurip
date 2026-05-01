import { useUserStore } from '~/stores/user'

const WELCOME_SEEN_KEY = 'yorurip.welcome_seen'

function hasSeenWelcome(): boolean {
  if (import.meta.server) return false
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * オンボーディングのアクセス制御。
 *
 *   未業種選択 (profile なし):
 *     - 初回 (welcome 未閲覧) → /welcome へ強制
 *     - welcome 閲覧済み → /onboarding (業種選択) へ強制、それ以外のパスはブロック
 *
 *   業種選択済み:
 *     - /welcome / /onboarding (業種選択画面) には戻れない → / に飛ばす
 *     - /onboarding/genji / /onboarding/tone は許可 (任意フローなので訪問可)
 *
 * SSR 時は Supabase 認証状態が不定なので何もしない。
 * plugins/auth.client.ts (async) が解決した後に navigation が走るので
 * ここでは store 状態を信用して OK。
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const userStore = useUserStore()

  // 認証ブートストラップが終わっていない (Supabase 未設定等) は判定しない
  if (!userStore.bootstrapped) return

  const onboarded = userStore.isOnboarded
  const path = to.path

  if (!onboarded) {
    // 初回ユーザーは welcome を必ず通す
    if (!hasSeenWelcome()) {
      if (path !== '/welcome') {
        return navigateTo('/welcome', { replace: true })
      }
      return
    }
    // welcome 閲覧済み → onboarding (業種選択 + ジェンジ + 口調) のどれかにいる必要がある
    if (path !== '/onboarding' && !path.startsWith('/onboarding/')) {
      return navigateTo('/onboarding', { replace: true })
    }
    return
  }

  // onboarded
  if (path === '/welcome' || path === '/onboarding') {
    return navigateTo('/', { replace: true })
  }
})
