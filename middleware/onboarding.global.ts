import { useUserStore } from '~/stores/user'

/**
 * オンボーディングのアクセス制御。
 *
 *   未業種選択(profileなし):
 *     - /onboarding のみ許可。それ以外は /onboarding に飛ばす
 *     - /onboarding/tone は profile 必須なので /onboarding に戻す
 *
 *   業種選択済み:
 *     - /onboarding (業種選択画面) には戻れない → / に飛ばす
 *     - /onboarding/tone は許可(設定画面相当の任意フローなので訪問可)
 *
 * SSR時はSupabase認証状態が不定なので何もしない。
 * plugins/auth.client.ts (async) が解決した後に navigation が走るので
 * ここでは store 状態を信用してOK。
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const userStore = useUserStore()

  // 認証ブートストラップが終わっていない (Supabase未設定等) は判定しない
  if (!userStore.bootstrapped) return

  const onboarded = userStore.isOnboarded
  const path = to.path

  if (!onboarded) {
    if (path !== '/onboarding') {
      return navigateTo('/onboarding', { replace: true })
    }
    return
  }

  // onboarded
  if (path === '/onboarding') {
    return navigateTo('/', { replace: true })
  }
})
