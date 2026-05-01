import type { Database } from '~/types/db'

// 型付き Supabase クライアント。
// import { useDB } from '~/composables/useDB' で使う。
// from('customers').select() などが Database 型から推論される。
export const useDB = () => useSupabaseClient<Database>()
