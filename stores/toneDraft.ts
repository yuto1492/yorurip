import { defineStore } from 'pinia'
import type { Channel } from '~/types/domain'

const SLOTS_PER_CHANNEL = 5

function emptySlots(): string[] {
  return Array.from({ length: SLOTS_PER_CHANNEL }, () => '')
}

function emptyDrafts(): Record<Channel, string[]> {
  return {
    dm: emptySlots(),
    x_post: emptySlots(),
    thanks: emptySlots(),
  }
}

/**
 * オンボーディング 2/2 で入力中の口調サンプル下書きを保持する。
 * pinia-plugin-persistedstate で localStorage に永続化されるので、
 * ブラウザを閉じたり画面遷移したりしても再開可能。
 *
 * 「保存して始める」が成功して DB に書き込まれた時に clearAll() で消える。
 * スキップした場合は残す(ユーザーが後で続きをやれる)。
 */
export const useToneDraftStore = defineStore(
  'toneDraft',
  () => {
    const drafts = ref<Record<Channel, string[]>>(emptyDrafts())

    function ensure(channel: Channel): void {
      if (!drafts.value[channel] || drafts.value[channel].length !== SLOTS_PER_CHANNEL) {
        drafts.value[channel] = emptySlots()
      }
    }

    function getSlots(channel: Channel): string[] {
      ensure(channel)
      return drafts.value[channel]
    }

    function setSlot(channel: Channel, index: number, value: string): void {
      ensure(channel)
      // 配列を作り直して reactivity と persist の取りこぼしを防ぐ
      const next = [...drafts.value[channel]]
      next[index] = value
      drafts.value[channel] = next
    }

    function setAllSlots(channel: Channel, values: string[]): void {
      const next = emptySlots()
      for (let i = 0; i < SLOTS_PER_CHANNEL; i++) next[i] = values[i] ?? ''
      drafts.value[channel] = next
    }

    function validCount(channel: Channel): number {
      ensure(channel)
      return drafts.value[channel].filter((s) => s.trim().length > 0).length
    }

    function totalValidCount(): number {
      return (
        validCount('dm') + validCount('thanks') + validCount('x_post')
      )
    }

    function clearAll(): void {
      drafts.value = emptyDrafts()
    }

    return {
      drafts,
      getSlots,
      setSlot,
      setAllSlots,
      validCount,
      totalValidCount,
      clearAll,
    }
  },
  {
    persist: true, // 全 state を localStorage に保存
  },
)
