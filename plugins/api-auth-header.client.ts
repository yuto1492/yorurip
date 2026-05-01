/**
 * 全 /api/* 呼び出しに Authorization: Bearer <access_token> を自動付与する。
 *
 * このアプリは `useSsrCookies: false` なので Supabase セッションは localStorage 保管。
 * 通常の $fetch はクッキーを送らないため、サーバ側 (`serverSupabaseUser`) が認証できない。
 * このプラグインで $fetch のインスタンスをラップし、内部 API ルート向けには
 * 必ず Authorization ヘッダーを付ける。
 *
 * サーバ側は `~/server/utils/auth.ts` の `getAuthUser` で Bearer を読み取る。
 *
 * dependsOn を使って Supabase クライアントが初期化された後に走らせる。
 */
export default defineNuxtPlugin({
  name: 'api-auth-header',
  enforce: 'pre',
  setup() {
    const supabase = useSupabaseClient()

    const wrapped = $fetch.create({
      onRequest: async ({ request, options }) => {
        const url =
          typeof request === 'string'
            ? request
            : request instanceof URL
              ? request.pathname
              : ''
        // 自前の API ルートのみ対象 (外部 URL や絶対パスは触らない)
        if (!url.startsWith('/api/')) return

        // セッションを取得しつつ、access_token が期限切れ寸前なら自前で refresh する。
        // getSession は本来 auto-refresh するはずだが、放置 (10h+) でうまく動かない
        // ケースを観測したため、明示的に検査する。
        let token: string | undefined
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (session) {
            const expiresAt = session.expires_at ?? 0
            const now = Math.floor(Date.now() / 1000)
            if (expiresAt < now + 30) {
              // 期限切れ or 30秒以内に切れる
              const { data: refreshed, error: refreshErr } =
                await supabase.auth.refreshSession()
              if (!refreshErr && refreshed.session) {
                token = refreshed.session.access_token
              } else {
                // refresh できない = 旧セッションは死んでいる。
                // ここで匿名サインインをかけ直す (= 新しい user_id になり旧データは見えなくなる)
                console.warn(
                  '[api-auth] refresh failed, signing in anonymously:',
                  refreshErr?.message,
                )
                await supabase.auth.signOut().catch(() => {})
                const { data: anon, error: anonErr } =
                  await supabase.auth.signInAnonymously()
                if (!anonErr) {
                  token = anon.session?.access_token
                }
              }
            } else {
              token = session.access_token
            }
          } else {
            // session が空 = 匿名サインインがまだ走っていない or 切れている
            const { data: anon, error: anonErr } =
              await supabase.auth.signInAnonymously()
            if (!anonErr) {
              token = anon.session?.access_token
            }
          }
        } catch (e) {
          console.warn('[api-auth] session resolve failed:', e)
        }
        if (!token) return

        // Headers (object / Headers / array) を Object 形式に正規化して書き加える。
        // 既存の Authorization は大文字小文字の組み合わせを問わず削除してから上書きする。
        // (これをしないと 'Authorization' と 'authorization' の 2 つが共存して、
        //  HTTP ヘッダーとして "Bearer A, Bearer B" のように結合され壊れる)
        const existing = options.headers as
          | Headers
          | Record<string, string>
          | [string, string][]
          | undefined
        const headers: Record<string, string> = {}
        const copyEntry = (k: string, v: string): void => {
          if (k.toLowerCase() === 'authorization') return // 既存の auth は無視
          headers[k] = v
        }
        if (existing instanceof Headers) {
          existing.forEach((v, k) => copyEntry(k, v))
        } else if (Array.isArray(existing)) {
          for (const [k, v] of existing) copyEntry(k, v)
        } else if (existing && typeof existing === 'object') {
          for (const [k, v] of Object.entries(existing)) {
            copyEntry(k, v as string)
          }
        }
        headers.Authorization = `Bearer ${token}`
        ;(options as { headers: unknown }).headers = headers
      },
    })

    // グローバル $fetch を差し替え。Nuxt の $fetch / Nitro 由来 $fetch / globalThis.$fetch
    // すべて同一参照なので、ここで上書きすれば以降の呼び出し全部に効く。
    ;(globalThis as { $fetch: unknown }).$fetch = wrapped
  },
})
