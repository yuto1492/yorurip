/**
 * 簡易インメモリレートリミッタ。10回/分/ユーザー(CLAUDE.md準拠)。
 * Vercel等で複数インスタンスにスケールすると不正確になるが、MVPは許容。
 * 後続でSupabase上のテーブルかRedisに置き換え。
 */

const WINDOW_MS = 60_000
const LIMIT = 10
const buckets = new Map<string, number[]>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

export function consumeRate(userId: string): RateLimitResult {
  const now = Date.now()
  const arr = (buckets.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)

  if (arr.length >= LIMIT) {
    const oldest = arr[0] ?? now
    const retryAfterMs = WINDOW_MS - (now - oldest)
    buckets.set(userId, arr)
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    }
  }

  arr.push(now)
  buckets.set(userId, arr)
  return { ok: true, remaining: LIMIT - arr.length, retryAfterSec: 0 }
}

/**
 * 単発クールダウン: key ごとに「最後に成功した時刻」を覚え、
 * cooldownMs 経過するまで ok=false を返す。
 *
 * 連打で高コストAPIを呼びたくない用途 (口調分析が代表例)。
 * key の粒度は呼び出し側が決める (例: `${userId}:${channel}`)。
 */
export interface CooldownResult {
  ok: boolean
  retryAfterSec: number
}

const cooldowns = new Map<string, number>()

export function consumeCooldown(key: string, cooldownMs: number): CooldownResult {
  const now = Date.now()
  const last = cooldowns.get(key) ?? 0
  const elapsed = now - last
  if (last > 0 && elapsed < cooldownMs) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000)),
    }
  }
  cooldowns.set(key, now)
  return { ok: true, retryAfterSec: 0 }
}
