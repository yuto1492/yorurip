import { defineStore } from 'pinia'
import type { Channel, ToneFeatureSet, ToneSample } from '~/types/domain'

const SAMPLE_LIMIT = 100

interface AnalyzeResponse {
  ok: boolean
  features?: ToneFeatureSet
  sampleCount: number
  reason?: string
}

/**
 * チャネルごとに口調サンプルをロード/削除/再分析する。
 * RLS が user_id 一致を強制するので user_id 条件はここで付けない(Supabaseが推論)。
 */
export const useToneStore = defineStore('tone', () => {
  const samplesByChannel = ref<Partial<Record<Channel, ToneSample[]>>>({})
  const counts = ref<Partial<Record<Channel, number>>>({})
  const loading = ref<Partial<Record<Channel, boolean>>>({})
  const analyzing = ref<Partial<Record<Channel, boolean>>>({})
  const error = ref<string | null>(null)

  async function fetchSamples(channel: Channel): Promise<void> {
    if (loading.value[channel]) return
    loading.value = { ...loading.value, [channel]: true }
    error.value = null
    try {
      const supabase = useDB()
      const user = useSupabaseUser().value
      if (!user) {
        samplesByChannel.value = { ...samplesByChannel.value, [channel]: [] }
        counts.value = { ...counts.value, [channel]: 0 }
        return
      }
      const { data, count, error: err } = await supabase
        .from('tone_samples')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('channel', channel)
        .order('created_at', { ascending: false })
        .limit(SAMPLE_LIMIT)
      if (err) throw err
      samplesByChannel.value = {
        ...samplesByChannel.value,
        [channel]: (data ?? []) as ToneSample[],
      }
      counts.value = { ...counts.value, [channel]: count ?? 0 }
    } catch (e: unknown) {
      const m = e as { message?: string }
      error.value = m?.message ?? '読み込みに失敗しました'
    } finally {
      loading.value = { ...loading.value, [channel]: false }
    }
  }

  /**
   * 手動収集(オンボーディング/設定画面)のサンプル一括追加。
   * 空文字や2000字超は除外。同じチャネルのcounts/cacheも更新する。
   */
  async function addSamples(channel: Channel, contents: string[]): Promise<number> {
    const supabase = useDB()
    const user = useSupabaseUser().value
    if (!user) throw new Error('not authenticated')

    const cleaned = contents
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && c.length <= 2000)
    if (cleaned.length === 0) return 0

    const rows = cleaned.map((content) => ({
      user_id: user.id,
      channel,
      content,
      source: 'manual' as const,
    }))

    const { data, error: err } = await supabase
      .from('tone_samples')
      .insert(rows)
      .select()
    if (err) throw err

    const inserted = (data ?? []) as ToneSample[]
    const current = samplesByChannel.value[channel] ?? []
    samplesByChannel.value = {
      ...samplesByChannel.value,
      // 新着が先頭になるよう逆順で先頭に積む
      [channel]: [...inserted.slice().reverse(), ...current],
    }
    counts.value = {
      ...counts.value,
      [channel]: (counts.value[channel] ?? 0) + inserted.length,
    }
    return inserted.length
  }

  /**
   * 既存サンプルの content を編集して DB に反映する。
   * RLS により本人所有のみ更新可能。
   */
  async function updateSample(
    channel: Channel,
    id: string,
    content: string,
  ): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) throw new Error('content required')
    if (trimmed.length > 2000) throw new Error('content too long')
    const supabase = useDB()
    const { error: err } = await supabase
      .from('tone_samples')
      .update({ content: trimmed })
      .eq('id', id)
    if (err) throw err
    const current = samplesByChannel.value[channel] ?? []
    samplesByChannel.value = {
      ...samplesByChannel.value,
      [channel]: current.map((s) =>
        s.id === id ? { ...s, content: trimmed } : s,
      ),
    }
  }

  async function deleteSample(channel: Channel, id: string): Promise<void> {
    const supabase = useDB()
    const { error: err } = await supabase
      .from('tone_samples')
      .delete()
      .eq('id', id)
    if (err) throw err
    const current = samplesByChannel.value[channel] ?? []
    samplesByChannel.value = {
      ...samplesByChannel.value,
      [channel]: current.filter((s) => s.id !== id),
    }
    counts.value = {
      ...counts.value,
      [channel]: Math.max(0, (counts.value[channel] ?? 1) - 1),
    }
  }

  async function runAnalyze(channel: Channel): Promise<AnalyzeResponse> {
    if (analyzing.value[channel]) {
      return { ok: false, sampleCount: counts.value[channel] ?? 0, reason: 'busy' }
    }
    analyzing.value = { ...analyzing.value, [channel]: true }
    try {
      const callOnce = () =>
        useApiFetch<AnalyzeResponse>('/api/tone/analyze', {
          method: 'POST',
          body: { channel },
        })
      try {
        return await callOnce()
      } catch (e: unknown) {
        const err = e as {
          status?: number
          statusCode?: number
          data?: { statusMessage?: string }
          message?: string
        }
        const status = err.status ?? err.statusCode

        // 401 が出た = access_token が失効している可能性 → refresh して 1 回だけリトライ
        if (status === 401) {
          const supabase = useSupabaseClient()
          const { error: refreshErr } = await supabase.auth.refreshSession()
          if (!refreshErr) {
            try {
              return await callOnce()
            } catch (retryErr) {
              const rerr = retryErr as { status?: number; statusCode?: number }
              const rstatus = rerr.status ?? rerr.statusCode
              if (rstatus === 401) {
                return {
                  ok: false,
                  sampleCount: counts.value[channel] ?? 0,
                  reason: 'unauthorized',
                }
              }
              throw retryErr
            }
          }
          // refresh も失敗 → 古いセッションを破棄して匿名からやり直し
          await supabase.auth.signOut().catch(() => {})
          const { error: anonErr } = await supabase.auth.signInAnonymously()
          if (!anonErr) {
            try {
              return await callOnce()
            } catch {
              /* fall through */
            }
          }
          return {
            ok: false,
            sampleCount: counts.value[channel] ?? 0,
            reason: 'unauthorized',
          }
        }

        // 429 = サーバ側のクールダウン (60秒に1回)。エラー扱いせず構造化レスポンスに変換
        if (status === 429) {
          return {
            ok: false,
            sampleCount: counts.value[channel] ?? 0,
            reason: err.data?.statusMessage ?? err.message ?? '60秒に1回までです',
          }
        }
        throw e
      }
    } finally {
      analyzing.value = { ...analyzing.value, [channel]: false }
    }
  }

  return {
    samplesByChannel,
    counts,
    loading,
    analyzing,
    error,
    fetchSamples,
    addSamples,
    updateSample,
    deleteSample,
    runAnalyze,
  }
})
