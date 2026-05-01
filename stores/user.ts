import { defineStore } from 'pinia'
import type { Industry, SafetyMode, UserProfile } from '~/types/domain'
import type { Json, UpdateTables } from '~/types/db'

export interface ProfileUpdates {
  industry?: Industry
  genji_name?: string | null
  safety_mode?: SafetyMode
  ng_words?: string[]
  x_post_hashtags?: string[]
}

/**
 * 「#コンカフェ」「コンカフェ」「 コンカフェ 」 などをまとめて
 * 「コンカフェ」(先頭#なし、空白なし)に正規化する。
 * X側のルールで # と空白以外は割と寛容なので強い制限は入れない。
 */
function normalizeHashtag(raw: string): string {
  return raw
    .trim()
    .replace(/^[#＃]+/, '')
    .replace(/\s+/g, '')
    .slice(0, 50)
}

/**
 * Composition API style で書いている。
 * options style + supabase-js v2 の組み合わせで TS2589 (excessively deep) が
 * 発生したため、推論チェーンを浅く保つために setup style を採用。
 */
export const useUserStore = defineStore(
  'user',
  () => {
    const profile = ref<UserProfile | null>(null)
    const loading = ref(false)
    const bootstrapped = ref(false)

    const isOnboarded = computed(() => !!profile.value?.industry)
    const industry = computed<Industry | null>(
      () => (profile.value?.industry ?? null) as Industry | null,
    )
    const safetyMode = computed<SafetyMode>(
      () => (profile.value?.safety_mode ?? 'normal') as SafetyMode,
    )
    const ngWords = computed<string[]>(() => {
      const raw = profile.value?.ng_words
      return Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string')
        : []
    })

    /** X 公開投稿時に末尾に付けるハッシュタグ(# は含まないタグ名のみ) */
    const xPostHashtags = computed<string[]>(() => {
      const raw = profile.value?.x_post_hashtags
      return Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string')
        : []
    })

    async function fetchProfile(): Promise<void> {
      const supabase = useDB()
      const user = useSupabaseUser().value
      if (!user) {
        profile.value = null
        return
      }
      loading.value = true
      try {
        const { data, error } = await supabase
          .from('user_profile')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
        if (error) throw error
        profile.value = (data as UserProfile | null) ?? null
      } finally {
        loading.value = false
        bootstrapped.value = true
      }
    }

    async function createProfile(
      industryValue: Industry,
      options?: { genjiName?: string },
    ): Promise<void> {
      const supabase = useDB()
      const user = useSupabaseUser().value
      if (!user) throw new Error('not authenticated')

      // upsert: 既存プロファイルがあっても上書きで成功させる(再オンボーディング想定)
      const { data, error } = await supabase
        .from('user_profile')
        .upsert(
          {
            user_id: user.id,
            industry: industryValue,
            genji_name: options?.genjiName ?? null,
          },
          { onConflict: 'user_id' },
        )
        .select()
        .single()
      if (error) throw error
      profile.value = data as UserProfile
    }

    async function updateSafetyMode(mode: SafetyMode): Promise<void> {
      await updateProfile({ safety_mode: mode })
    }

    /**
     * 任意フィールドの部分更新。industry/genji_name/safety_mode/ng_words に対応。
     */
    async function updateProfile(updates: ProfileUpdates): Promise<void> {
      const supabase = useDB()
      const user = useSupabaseUser().value
      if (!user || !profile.value) throw new Error('profile not loaded')

      const patch: UpdateTables<'user_profile'> = {}
      if (updates.industry !== undefined) patch.industry = updates.industry
      if (updates.genji_name !== undefined)
        patch.genji_name = updates.genji_name?.trim() || null
      if (updates.safety_mode !== undefined) patch.safety_mode = updates.safety_mode
      if (updates.ng_words !== undefined) {
        patch.ng_words = updates.ng_words
          .map((w) => w.trim())
          .filter((w) => w.length > 0) as Json
      }
      if (updates.x_post_hashtags !== undefined) {
        // 重複排除しつつ正規化
        const seen = new Set<string>()
        const normalized: string[] = []
        for (const t of updates.x_post_hashtags) {
          const n = normalizeHashtag(t)
          if (n && !seen.has(n)) {
            seen.add(n)
            normalized.push(n)
          }
        }
        patch.x_post_hashtags = normalized as Json
      }
      if (Object.keys(patch).length === 0) return

      const { data, error } = await supabase
        .from('user_profile')
        .update(patch)
        .eq('user_id', user.id)
        .select()
        .single()
      if (error) throw error
      profile.value = data as UserProfile
    }

    /**
     * 匿名 → 正規ユーザー昇格用に email を紐付ける。
     * Supabase が確認メールを送信し、ユーザーがリンクをクリックすると確定。
     * user_id は変わらず、既存データが紐付いたまま昇格する。
     */
    async function linkEmail(email: string): Promise<void> {
      const supabase = useSupabaseClient()
      const trimmed = email.trim()
      if (!trimmed) throw new Error('email required')
      // 後で onAuthStateChange 側でデータ移行が必要かどうかを判定するため、
      // ユーザーの「これは link (= データ保持希望)」意図を localStorage に残す。
      // signInWithEmail (= 別アカウントへの切替) は明示的にデータ放棄なので
      // 'switch' を立てる方の処理側に分岐させる。
      try {
        localStorage.setItem('yorurip.auth_intent', 'link')
      } catch {
        // localStorage 不可環境でもログインは進める
      }
      // 確認メール内のリンクの戻り先を実行環境のオリジンに固定する。
      // (Supabase ダッシュボードの Site URL に依存しないので、dev = localhost、
      //  本番 = 本番ドメイン に自動で切り替わる。Redirect URLs allowlist に
      //  両ドメインを登録しておく必要あり)
      const redirectTo =
        typeof window !== 'undefined' ? window.location.origin : undefined
      const { error } = await supabase.auth.updateUser(
        { email: trimmed },
        redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      )
      if (error) throw error
    }

    /**
     * 既存アカウントへの Magic Link ログイン。
     * 「すでにアカウントを持っているユーザー」が別端末で再ログインするとき、
     * またはゲストモードで使い始めて後から既存アカウントに切替えたいとき用。
     *
     * shouldCreateUser: false なので新規作成はせず、メールが既存ユーザーのもの
     * でないと送信されない。
     *
     * 注意: 現在のゲストセッション(匿名ユーザー)はリンククリック時に
     * 既存アカウントのセッションに置き換わる。匿名側に保存されていた
     * カルテ・口調等は孤児化する(連携ではないので user_id が乗り換わる)。
     */
    async function signInWithEmail(email: string): Promise<void> {
      const supabase = useSupabaseClient()
      const trimmed = email.trim()
      if (!trimmed) throw new Error('email required')
      // 「既存アカウントへ切替」フローはデータ放棄が前提。auth state change 側でも
      // この intent を見て移行を行わない判定をする。
      try {
        localStorage.setItem('yorurip.auth_intent', 'switch')
      } catch {
        /* noop */
      }
      // 確認メール内のリンクの戻り先を実行環境のオリジンに固定する
      // (Supabase ダッシュボードの Site URL に依存しないので環境別に自動切替)
      const redirectTo =
        typeof window !== 'undefined' ? window.location.origin : undefined
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false,
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      })
      if (error) throw error
    }

    /**
     * サインアウト。次回起動時の auth.client プラグインで再度 anonymous sign-in が走り、
     * 新規 user_id で開始されるためデータは見えなくなる(別端末扱い)。
     * 連携前に呼ぶと過去データが孤児化するので、UI で警告するのが望ましい。
     */
    async function signOut(): Promise<void> {
      const supabase = useSupabaseClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      profile.value = null
      bootstrapped.value = false
    }

    function reset(): void {
      profile.value = null
      bootstrapped.value = false
    }

    return {
      profile,
      loading,
      bootstrapped,
      isOnboarded,
      industry,
      safetyMode,
      ngWords,
      xPostHashtags,
      fetchProfile,
      signInWithEmail,
      createProfile,
      updateSafetyMode,
      updateProfile,
      linkEmail,
      signOut,
      reset,
    }
  },
  {
    persist: {
      // profileはSupabaseが真。再読込時の体感速度のためにキャッシュだけ持つ。
      pick: ['profile'],
    },
  },
)
