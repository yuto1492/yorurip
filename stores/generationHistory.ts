import { defineStore } from 'pinia'
import type { Channel, GenerationMode, ReplyFlow } from '~/types/domain'

/**
 * 1 回の生成 = 1 entry。プロンプト入力 + 3 候補 をひとまとめに保存。
 * 画面遷移で消えてしまうのを防ぐため Pinia + localStorage に永続化する。
 */
export interface HistoryEntry {
  id: string
  createdAt: string
  mode: GenerationMode
  channel: Channel
  inputs: {
    sceneType?: string
    customerId?: string
    customerName?: string
    incomingMessage?: string
    todayEvent?: string
    lengthPreference?: 'short' | 'medium' | 'long'
    affectionLevel?: number
    replyFlow?: ReplyFlow
    extraInstructions?: string
  }
  candidates: [string, string, string]
  /** 表示用の客名(customerId なら nickname、そうでなければ customerName) */
  customerNickname?: string
  /** サーバ側の generation_history.id (DB 履歴とのトレーサビリティ用) */
  serverHistoryId?: string
}

/** モード別の最大保存件数 (1 entry = 3 候補なので、33 件 ≒ 99 候補ぶんの履歴) */
const MAX_PER_MODE = 33

const ALL_MODES: GenerationMode[] = [
  'general',
  'personal',
  'reply',
  'thanks',
  'public_post',
]

function emptyByMode(): Record<GenerationMode, HistoryEntry[]> {
  return {
    general: [],
    personal: [],
    reply: [],
    thanks: [],
    public_post: [],
  }
}

function genId(): string {
  // 簡易ID。crypto.randomUUID() が使える環境ならそちらを優先
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const useGenerationHistoryStore = defineStore(
  'generationHistory',
  () => {
    const byMode = ref<Record<GenerationMode, HistoryEntry[]>>(emptyByMode())

    function getByMode(mode: GenerationMode): HistoryEntry[] {
      return byMode.value[mode] ?? []
    }

    function totalCount(): number {
      return ALL_MODES.reduce((sum, m) => sum + (byMode.value[m]?.length ?? 0), 0)
    }

    function addEntry(
      entry: Omit<HistoryEntry, 'id' | 'createdAt'>,
    ): HistoryEntry {
      const full: HistoryEntry = {
        ...entry,
        id: genId(),
        createdAt: new Date().toISOString(),
      }
      const current = byMode.value[entry.mode] ?? []
      // 新着が先頭、最大件数を超えたら末尾を切り捨て
      const next = [full, ...current].slice(0, MAX_PER_MODE)
      byMode.value = { ...byMode.value, [entry.mode]: next }
      return full
    }

    function removeEntry(mode: GenerationMode, id: string): void {
      const current = byMode.value[mode] ?? []
      byMode.value = {
        ...byMode.value,
        [mode]: current.filter((e) => e.id !== id),
      }
    }

    function clearMode(mode: GenerationMode): void {
      byMode.value = { ...byMode.value, [mode]: [] }
    }

    function clearAll(): void {
      byMode.value = emptyByMode()
    }

    return {
      byMode,
      MAX_PER_MODE,
      getByMode,
      totalCount,
      addEntry,
      removeEntry,
      clearMode,
      clearAll,
    }
  },
  {
    persist: true,
  },
)
