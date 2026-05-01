import { useUserStore } from '~/stores/user'

const STORAGE_KEY_ANON_ID = 'yorurip.anon_user_id'
const STORAGE_KEY_INTENT = 'yorurip.auth_intent'

/**
 * クライアント起動時に1回だけ実行:
 *   1. supabase.auth.getSession() で localStorage から既存セッションを明示復元
 *      (useSupabaseUser() の ref はモジュール初期化直後では null を返すことがあるため、
 *       これに頼ると F5 のたびに「セッション無し」と判定されて新規匿名サインインが走り、
 *       user_id が変わって過去データが孤児化する)
 *   2. セッションが本当に無い場合だけ Anonymous Sign-In
 *   3. user_profile を取得して store に乗せる
 *   4. onAuthStateChange を購読し、匿名 → メール認証昇格時に
 *      旧匿名ユーザーのデータを新しい user_id へサーバ側で移行する
 *
 * dependsOn により @pinia/nuxt 初期化と persistedstate 登録を待つ。
 */
export default defineNuxtPlugin({
  name: 'auth-bootstrap',
  dependsOn: ['pinia-persistedstate'],
  async setup() {
    const supabase = useSupabaseClient()
    const userRef = useSupabaseUser()
    const userStore = useUserStore()

    // 1. 既存セッションの明示復元(localStorage / cookie 由来)
    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.warn('[auth] getSession failed:', error.message)
      } else {
        session = data.session
      }
    } catch (e) {
      console.warn('[auth] getSession threw:', e)
    }

    // 2. セッションがあっても access_token が期限切れ寸前なら明示的に refresh する。
    //    放置で 1 時間以上経過すると access_token は失効しているが getSession は
    //    そのまま返すことがあるため、ここで先回りする。
    if (session) {
      const expiresAt = session.expires_at ?? 0
      const now = Math.floor(Date.now() / 1000)
      const stale = expiresAt < now + 60 // 残り 60 秒未満なら更新
      if (stale) {
        try {
          const { data: refreshed, error: refreshErr } =
            await supabase.auth.refreshSession()
          if (refreshErr) {
            console.warn('[auth] refresh failed, will re-anon:', refreshErr.message)
            // refresh_token が死んでいる → セッションを破棄して anonymous からやり直す
            await supabase.auth.signOut().catch(() => {})
            session = null
          } else {
            session = refreshed.session
          }
        } catch (e) {
          console.warn('[auth] refresh threw:', e)
          await supabase.auth.signOut().catch(() => {})
          session = null
        }
      }
    }

    let user = session?.user ?? null

    // 3. それでもセッションが無いときは匿名サインイン
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) {
        console.warn('[auth] anonymous sign-in failed:', error.message)
        return
      }
      user = data.user ?? null
      if (user) userRef.value = user
    } else {
      // refresh で得た user を ref にも反映 (onAuthStateChange が走らないケース対策)
      userRef.value = user
    }

    // 匿名ユーザーの user_id を localStorage に控えておく。
    // 後で email 認証昇格時に「旧 user_id」として移行 API へ渡す。
    if (user?.is_anonymous) {
      try {
        localStorage.setItem(STORAGE_KEY_ANON_ID, user.id)
      } catch {
        /* noop */
      }
    }

    // 3. プロファイル取得
    try {
      await userStore.fetchProfile()
    } catch (e) {
      console.warn('[auth] fetchProfile failed:', e)
    }

    // 4. 匿名 → email 認証への遷移を検出してデータ移行
    //    SIGNED_IN は magic link クリック直後にも発火する。
    //    新しい user.id ≠ 旧匿名 user.id かつ intent='link' なら移行を実行。
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN') return
      const newUser = session?.user
      if (!newUser) return

      let oldAnonId: string | null = null
      let intent: string | null = null
      try {
        oldAnonId = localStorage.getItem(STORAGE_KEY_ANON_ID)
        intent = localStorage.getItem(STORAGE_KEY_INTENT)
      } catch {
        /* noop */
      }

      // 匿名のままなら何もしない (まだ昇格してない)
      if (!newUser.email) {
        if (newUser.is_anonymous) {
          // 念のため最新の anon id を保存し直す
          try {
            localStorage.setItem(STORAGE_KEY_ANON_ID, newUser.id)
          } catch {
            /* noop */
          }
        }
        return
      }

      // email を持っている = 昇格 or 既存ログイン後
      // intent='switch' (=既存アカウントへの切替) はデータ放棄が前提なので何もしない
      if (intent === 'switch') {
        try {
          localStorage.removeItem(STORAGE_KEY_INTENT)
          localStorage.removeItem(STORAGE_KEY_ANON_ID)
        } catch {
          /* noop */
        }
        return
      }

      // 同じ user_id ならそのまま (Supabase 側で email_change が user_id を維持できたケース)
      if (!oldAnonId || oldAnonId === newUser.id) {
        try {
          localStorage.removeItem(STORAGE_KEY_INTENT)
        } catch {
          /* noop */
        }
        return
      }

      // user_id が変わってしまった = サーバ側で旧匿名→新ユーザーへデータ移行
      try {
        await $fetch('/api/auth/migrate-anonymous-data', {
          method: 'POST',
          body: { oldUserId: oldAnonId },
        })
        console.info('[auth] migrated anonymous data', {
          from: oldAnonId,
          to: newUser.id,
        })
        try {
          localStorage.removeItem(STORAGE_KEY_ANON_ID)
          localStorage.removeItem(STORAGE_KEY_INTENT)
        } catch {
          /* noop */
        }
        // データ移行が終わったらプロファイルを再取得して store を最新化
        await userStore.fetchProfile()
      } catch (e) {
        console.error('[auth] anonymous data migration failed:', e)
      }
    })
  },
})
