/**
 * Nitro API (`/api/*`) を叩くラッパー。
 * 現在の Supabase セッションの access_token を Authorization: Bearer ヘッダーに付与する。
 *
 * `useSsrCookies: false` のため、クライアントの session は localStorage にあり、
 * 通常の $fetch ではサーバ側に session 情報が届かない。
 * これを使えば確実にサーバ側で認証できる。
 *
 * 使用例:
 *   const res = await useApiFetch<T>('/api/tone/analyze', { method: 'POST', body: { channel } })
 */
export async function useApiFetch<T>(
  url: string,
  options: Record<string, unknown> = {},
): Promise<T> {
  const supabase = useSupabaseClient()

  // セッションを取得しつつ access_token が期限切れ寸前なら refresh する。
  // これは plugins/api-auth-header.client.ts と同じ防御だが、
  // useApiFetch を直接呼ぶ箇所も独立して動くようここでも実装する。
  let token: string | undefined
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      const expiresAt = session.expires_at ?? 0
      const now = Math.floor(Date.now() / 1000)
      if (expiresAt < now + 30) {
        const { data: refreshed, error } = await supabase.auth.refreshSession()
        if (!error && refreshed.session) {
          token = refreshed.session.access_token
        } else {
          // refresh 失敗 = refresh_token も死んでいる → 匿名で取り直す
          await supabase.auth.signOut().catch(() => {})
          const { data: anon, error: anonErr } =
            await supabase.auth.signInAnonymously()
          if (!anonErr) token = anon.session?.access_token
        }
      } else {
        token = session.access_token
      }
    } else {
      const { data: anon, error: anonErr } =
        await supabase.auth.signInAnonymously()
      if (!anonErr) token = anon.session?.access_token
    }
  } catch (e) {
    console.warn('[useApiFetch] session resolve failed:', e)
  }

  const baseHeaders =
    (options.headers as Record<string, string> | undefined) ?? {}
  const headers: Record<string, string> = { ...baseHeaders }
  if (token) headers.Authorization = `Bearer ${token}`

  return $fetch<T>(url, { ...options, headers }) as Promise<T>
}
