import { defineStore } from 'pinia'
import { useGenerationHistoryStore } from '~/stores/generationHistory'
import { useCustomersStore } from '~/stores/customers'
import type {
  Channel,
  GenerateResponse,
  GenerationMode,
  ReplyFlow,
  ToolCallProposal,
} from '~/types/domain'

type LengthPref = 'short' | 'medium' | 'long'

/**
 * 生成画面のフォーム状態と結果を保持。
 * 永続化はしない(過去の3案がリロード後に残ると混乱するため)。
 */
export const useGenerationStore = defineStore('generation', () => {
  // ----- 入力 ------------------------------------------
  const mode = ref<GenerationMode | null>(null)
  const channel = ref<Channel>('dm')
  const sceneType = ref('')
  const customerId = ref('')
  // 未登録客向け: reply/thanks モードで customerId 未指定時のフォールバック名
  const customerName = ref('')
  const incomingMessage = ref('')
  const todayEvent = ref('')
  const lengthPreference = ref<LengthPref>('medium')
  const affectionLevel = ref<number>(5) // 1〜10、デフォルト中間
  const replyFlow = ref<ReplyFlow>('continue') // 返信モード時のみ意味を持つ
  const extraInstructions = ref('') // 追加指示(返信モード等)

  // ----- 結果 ------------------------------------------
  const candidates = ref<string[]>([])
  const editedCandidates = ref<string[]>([])
  const toolCalls = ref<ToolCallProposal[]>([])
  const historyId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function resetResult(): void {
    candidates.value = []
    editedCandidates.value = []
    toolCalls.value = []
    historyId.value = null
    error.value = null
  }

  function removeToolCall(toolUseId: string): void {
    const idx = toolCalls.value.findIndex((t) => t.toolUseId === toolUseId)
    if (idx >= 0) toolCalls.value.splice(idx, 1)
  }

  /** 履歴 entry の候補を現在の編集領域に復元する(API は再叩きしない) */
  function loadCandidatesFromHistory(items: readonly string[]): void {
    if (items.length === 0) return
    candidates.value = [...items]
    editedCandidates.value = [...items]
    toolCalls.value = []
    error.value = null
  }

  function resetAll(): void {
    sceneType.value = ''
    customerId.value = ''
    customerName.value = ''
    incomingMessage.value = ''
    todayEvent.value = ''
    lengthPreference.value = 'medium'
    affectionLevel.value = 5
    replyFlow.value = 'continue'
    extraInstructions.value = ''
    resetResult()
  }

  async function generate(): Promise<void> {
    if (!mode.value) {
      error.value = 'mode が選択されていません'
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<GenerateResponse>('/api/generate', {
        method: 'POST',
        body: {
          mode: mode.value,
          channel: channel.value,
          sceneType: sceneType.value.trim() || undefined,
          customerId: customerId.value.trim() || undefined,
          customerName:
            !customerId.value.trim() && customerName.value.trim()
              ? customerName.value.trim()
              : undefined,
          incomingMessage: incomingMessage.value.trim() || undefined,
          todayEvent: todayEvent.value.trim() || undefined,
          lengthPreference: lengthPreference.value,
          affectionLevel: affectionLevel.value,
          // 返信モード時のみ意味を持つが、サーバ側で mode に応じて使う/無視する
          replyFlow:
            mode.value === 'reply' ? replyFlow.value : undefined,
          extraInstructions:
            mode.value === 'reply' && extraInstructions.value.trim()
              ? extraInstructions.value.trim()
              : undefined,
        },
      })
      candidates.value = [...res.candidates]
      editedCandidates.value = [...res.candidates]
      toolCalls.value = res.toolCalls ?? []
      historyId.value = res.historyId ?? null

      // ローカル履歴に保存(画面遷移で消えないように)
      try {
        const historyStore = useGenerationHistoryStore()
        const customersStore = useCustomersStore()
        const cid = customerId.value.trim()
        const cname = customerName.value.trim()
        const linkedCustomer = cid
          ? customersStore.list.find((c) => c.id === cid)
          : null
        const displayName = linkedCustomer?.nickname || cname || undefined

        historyStore.addEntry({
          mode: mode.value!,
          channel: channel.value,
          inputs: {
            sceneType: sceneType.value.trim() || undefined,
            customerId: cid || undefined,
            customerName: !cid && cname ? cname : undefined,
            incomingMessage: incomingMessage.value.trim() || undefined,
            todayEvent: todayEvent.value.trim() || undefined,
            lengthPreference: lengthPreference.value,
            affectionLevel: affectionLevel.value,
            replyFlow:
              mode.value === 'reply' ? replyFlow.value : undefined,
            extraInstructions:
              mode.value === 'reply' && extraInstructions.value.trim()
                ? extraInstructions.value.trim()
                : undefined,
          },
          candidates: res.candidates,
          customerNickname: displayName,
          serverHistoryId: res.historyId ?? undefined,
        })
      } catch (e) {
        console.warn('[generation] history save failed:', e)
      }
    } catch (e: unknown) {
      const err = e as { data?: { statusMessage?: string }; message?: string }
      error.value = err?.data?.statusMessage ?? err?.message ?? '生成に失敗しました'
    } finally {
      loading.value = false
    }
  }

  return {
    mode,
    channel,
    sceneType,
    customerId,
    customerName,
    incomingMessage,
    todayEvent,
    lengthPreference,
    affectionLevel,
    replyFlow,
    extraInstructions,
    candidates,
    editedCandidates,
    toolCalls,
    historyId,
    loading,
    error,
    generate,
    resetResult,
    resetAll,
    removeToolCall,
    loadCandidatesFromHistory,
  }
})
