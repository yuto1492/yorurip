import { serverSupabaseServiceRole } from '#supabase/server'
import { getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'

interface DeleteResponse {
  ok: true
}

/**
 * 現在ログインしているユーザーのアカウント自体を完全削除する。
 *
 * - 削除対象: auth.users.id = current user.id
 * - DB の各テーブル (customers / tone_samples / threads ...) は
 *   `references auth.users(id) on delete cascade` なので CASCADE で全消去される
 * - service role キー (`SUPABASE_SERVICE_KEY`) が必要
 *
 * クライアント側はこの呼び出し成功後に supabase.auth.signOut() を呼んでセッションを破棄する。
 */
export default defineEventHandler(async (event): Promise<DeleteResponse> => {
  const user = await getAuthUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  let admin
  try {
    admin = serverSupabaseServiceRole<Database>(event)
  } catch (e) {
    console.error('[delete-account] service role unavailable', e)
    throw createError({
      statusCode: 500,
      statusMessage:
        'service role key not configured (SUPABASE_SERVICE_KEY を設定してください)',
    })
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[delete-account] deleteUser failed', error.message)
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
