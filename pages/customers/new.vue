<script setup lang="ts">
import { useCustomersStore } from '~/stores/customers'
import type { CustomerInput } from '~/stores/customers'

useHead({ title: '客新規 | ヨルリプ' })

const store = useCustomersStore()
const router = useRouter()

const loading = ref(false)
const errorMsg = ref<string | null>(null)

async function handleSubmit(input: CustomerInput): Promise<void> {
  loading.value = true
  errorMsg.value = null
  try {
    const created = await store.create(input)
    await router.replace(`/customers/${created.id}`)
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    errorMsg.value = err?.data?.statusMessage ?? err?.message ?? '保存に失敗しました'
  } finally {
    loading.value = false
  }
}

function handleCancel(): void {
  router.back()
}
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto">
    <header class="mb-5">
      <NuxtLink
        to="/customers"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ 客管理</NuxtLink>
    </header>

    <h1 class="text-xl font-bold mb-5">新しい客を追加</h1>

    <p v-if="errorMsg" class="mb-3 text-xs text-red-400">{{ errorMsg }}</p>

    <CustomerForm
      :loading="loading"
      submit-label="作成"
      @submit="handleSubmit"
      @cancel="handleCancel"
    />
  </section>
</template>
