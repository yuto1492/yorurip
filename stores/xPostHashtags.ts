import { defineStore } from 'pinia'
import { DEFAULT_HASHTAGS } from '~/types/domain'

/**
 * X 公開投稿用ハッシュタグの登録状況をクライアント側で管理する。
 * Pinia + persist で localStorage に永続化される。
 *
 *   - 新規ユーザー(localStorage 未保存): DEFAULT_HASHTAGS が初期値として入る
 *   - 既存ユーザー: localStorage に保存された値が復元される
 *   - DB 上の user_profile.x_post_hashtags は使用しない
 *
 * 値は # を含まないタグ名のみ(表示時のみ # を付与)。
 */
export const useXPostHashtagsStore = defineStore(
  'xPostHashtags',
  () => {
    const tags = ref<string[]>([...DEFAULT_HASHTAGS])
    /**
     * ユーザーが「使わない」UI から削除した提案タグを記憶する。
     * 提案リスト(HASHTAG_SUGGESTIONS)から永続的に隠すために使う。
     * 一度 dismiss したものは再度提案として現れない。
     */
    const dismissedSuggestions = ref<string[]>([])

    function normalize(raw: string): string {
      return raw
        .trim()
        .replace(/^[#＃]+/, '')
        .replace(/\s+/g, '')
        .slice(0, 50)
    }

    function add(raw: string): boolean {
      const tag = normalize(raw)
      if (!tag) return false
      if (tags.value.includes(tag)) return false
      tags.value = [...tags.value, tag]
      // 登録された以上、dismiss済みでも復活
      if (dismissedSuggestions.value.includes(tag)) {
        dismissedSuggestions.value = dismissedSuggestions.value.filter(
          (t) => t !== tag,
        )
      }
      return true
    }

    function remove(tag: string): void {
      tags.value = tags.value.filter((t) => t !== tag)
    }

    function dismissSuggestion(raw: string): void {
      const tag = normalize(raw)
      if (!tag) return
      if (dismissedSuggestions.value.includes(tag)) return
      dismissedSuggestions.value = [...dismissedSuggestions.value, tag]
    }

    function setAll(next: string[]): void {
      const seen = new Set<string>()
      const cleaned: string[] = []
      for (const t of next) {
        const n = normalize(t)
        if (n && !seen.has(n)) {
          seen.add(n)
          cleaned.push(n)
        }
      }
      tags.value = cleaned
    }

    function reset(): void {
      tags.value = [...DEFAULT_HASHTAGS]
      dismissedSuggestions.value = []
    }

    return {
      tags,
      dismissedSuggestions,
      add,
      remove,
      dismissSuggestion,
      setAll,
      reset,
    }
  },
  { persist: true },
)
