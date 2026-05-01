<script setup lang="ts">
import { useUserStore } from '~/stores/user'

definePageMeta({
  title: '源氏名',
  pageTransition: { name: 'slide-left', mode: 'out-in', appear: false },
})
useHead({ title: '源氏名 | ヨルリプ' })

const userStore = useUserStore()
const router = useRouter()

const input = ref(userStore.profile?.genji_name ?? '')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

async function saveAndNext(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  errorMsg.value = null
  try {
    const value = input.value.trim()
    // 空欄送信(現状の値をクリアしたい場合)も含めて updateProfile は呼ぶ
    await userStore.updateProfile({ genji_name: value || null })
    await router.replace('/onboarding/tone')
  } catch (e: unknown) {
    errorMsg.value =
      (e as { message?: string })?.message ?? '保存に失敗しました'
  } finally {
    submitting.value = false
  }
}

async function skip(): Promise<void> {
  if (submitting.value) return
  await router.replace('/onboarding/tone')
}
</script>

<template>
  <section class="px-6 py-12 max-w-md mx-auto">
    <header class="mb-8">
      <p class="text-accent text-xs font-medium tracking-wide">ステップ 2/3</p>
      <h1 class="mt-1 text-2xl font-bold leading-tight">源氏名を教えて</h1>
      <p class="mt-2 text-ink-400 text-sm leading-relaxed">
        <span class="text-accent-soft">後から設定で変更できます。スキップしてもOK。</span>
      </p>
    </header>

    <div
      v-if="errorMsg"
      class="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 leading-relaxed"
    >
      <strong>エラー:</strong>
      {{ errorMsg }}
    </div>

    <label class="block text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">
      源氏名 (任意)
    </label>
    <input
      v-model="input"
      type="text"
      maxlength="40"
      placeholder=""
      class="w-full rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-base"
      :disabled="submitting"
      @keydown.enter.prevent="saveAndNext"
    >

    <div class="mt-6 flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-2xl bg-accent text-ink-950 font-semibold py-3 disabled:opacity-50 transition active:scale-[.99]"
        :disabled="submitting"
        @click="saveAndNext"
      >
        {{ submitting ? '保存中…' : '保存して次へ →' }}
      </button>
      <button
        type="button"
        class="rounded-2xl bg-ink-800 text-ink-400 font-medium px-5 disabled:opacity-50"
        :disabled="submitting"
        @click="skip"
      >
        スキップ
      </button>
    </div>

  </section>
</template>
