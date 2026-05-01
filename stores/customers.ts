import { defineStore } from 'pinia'
import type {
  ConversationMemo,
  Customer,
  CustomerPreferences,
  CustomerType,
  VisitLog,
} from '~/types/domain'

export interface CustomerInput {
  nickname: string
  age?: number | null
  occupation?: string | null
  customer_type?: CustomerType | null
  relation_score?: number | null
  ng_time?: string | null
  last_visit_at?: string | null
  preferences?: CustomerPreferences
  cheki_count?: number
  oshi_rank?: string | null
  goods_owned?: string[]
}

export interface CustomerDetail {
  customer: Customer
  visits: VisitLog[]
  memos: ConversationMemo[]
}

export const useCustomersStore = defineStore('customers', () => {
  const list = ref<Customer[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchList(): Promise<void> {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ customers: Customer[] }>('/api/customers')
      list.value = res.customers
      loaded.value = true
    } catch (e: unknown) {
      const err = e as { data?: { statusMessage?: string }; message?: string }
      error.value = err?.data?.statusMessage ?? err?.message ?? '読み込みに失敗しました'
    } finally {
      loading.value = false
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value && !loading.value) await fetchList()
  }

  async function create(input: CustomerInput): Promise<Customer> {
    const res = await $fetch<{ customer: Customer }>('/api/customers', {
      method: 'POST',
      body: input,
    })
    list.value = [res.customer, ...list.value]
    return res.customer
  }

  async function update(
    id: string,
    input: Partial<CustomerInput>,
  ): Promise<Customer> {
    const res = await $fetch<{ customer: Customer }>(`/api/customers/${id}`, {
      method: 'PATCH',
      body: input,
    })
    list.value = list.value.map((c) => (c.id === id ? res.customer : c))
    return res.customer
  }

  async function remove(id: string): Promise<void> {
    await $fetch(`/api/customers/${id}`, { method: 'DELETE' })
    list.value = list.value.filter((c) => c.id !== id)
  }

  async function fetchOne(id: string): Promise<CustomerDetail> {
    return await $fetch<CustomerDetail>(`/api/customers/${id}`)
  }

  return {
    list,
    loaded,
    loading,
    error,
    fetchList,
    ensureLoaded,
    create,
    update,
    remove,
    fetchOne,
  }
})
