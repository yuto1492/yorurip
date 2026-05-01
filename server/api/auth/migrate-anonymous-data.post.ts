import { serverSupabaseServiceRole } from '#supabase/server'
import { getAuthUser } from '~/server/utils/auth'
import type { Database } from '~/types/db'

interface MigrateRequest {
  oldUserId: string
}

interface MigrateResponse {
  ok: true
  migrated: Record<string, number>
}

/**
 * 匿名 → メール認証昇格時に user_id が変わってしまったケースで、
 * 旧匿名ユーザーが持っていたデータを新ユーザーへ全テーブル一括移行する。
 *
 * セキュリティ:
 *   - 呼び出し元は認証済み (新ユーザー)
 *   - body.oldUserId が「is_anonymous = true」のユーザーであることを admin API で検証
 *     (regular ユーザーの user_id を悪用してデータを盗まれない)
 *   - 自己ループ防止: oldUserId !== newUserId
 *
 * 必要な環境変数:
 *   - NUXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL): Supabase URL
 *   - SUPABASE_SERVICE_KEY: サービスロールキー (RLS バイパス + admin API)
 */
export default defineEventHandler(async (event): Promise<MigrateResponse> => {
  // 1. 呼び出し元の認証 (新ユーザー)
  const newUser = await getAuthUser(event)
  if (!newUser)
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })

  const body = await readBody<Partial<MigrateRequest>>(event)
  const oldUserId = body?.oldUserId
  if (!oldUserId || typeof oldUserId !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'oldUserId required' })
  if (oldUserId === newUser.id)
    throw createError({ statusCode: 400, statusMessage: 'oldUserId equals current user' })

  // 2. サービスロールクライアント (RLS バイパス用)
  let admin
  try {
    admin = serverSupabaseServiceRole<Database>(event)
  } catch (e) {
    console.error('[migrate] service role unavailable', e)
    throw createError({
      statusCode: 500,
      statusMessage:
        'service role key not configured (SUPABASE_SERVICE_KEY を設定してください)',
    })
  }

  // 3. 旧 user が anonymous であることを検証
  const { data: oldUserRes, error: oldUserErr } = await admin.auth.admin.getUserById(oldUserId)
  if (oldUserErr) {
    console.error('[migrate] getUserById failed', oldUserErr)
    throw createError({ statusCode: 500, statusMessage: oldUserErr.message })
  }
  const oldAuthUser = oldUserRes?.user
  if (!oldAuthUser)
    throw createError({ statusCode: 404, statusMessage: 'old user not found' })
  if (!oldAuthUser.is_anonymous)
    throw createError({
      statusCode: 403,
      statusMessage: 'old user is not anonymous; refusing to migrate',
    })

  // 4. 各テーブルで user_id を旧 → 新へ書き換え。
  //    user_profile は PK = user_id なので衝突回避処理を別途。
  const migrated: Record<string, number> = {}

  // 4a. user_profile マージ: 新ユーザーの行があれば旧の中身で上書き、なければ旧を移転
  {
    const { data: oldProfile } = await admin
      .from('user_profile')
      .select('*')
      .eq('user_id', oldUserId)
      .maybeSingle()

    if (oldProfile) {
      const { data: newProfile } = await admin
        .from('user_profile')
        .select('*')
        .eq('user_id', newUser.id)
        .maybeSingle()

      if (newProfile) {
        // 旧プロファイルの中身を新ユーザーの行へコピー (匿名時に作り込んだ情報を残す)
        const merged = {
          industry: oldProfile.industry,
          genji_name: oldProfile.genji_name,
          safety_mode: oldProfile.safety_mode,
          tone_features: oldProfile.tone_features,
          ng_words: oldProfile.ng_words,
          x_post_hashtags: oldProfile.x_post_hashtags,
        }
        const { error } = await admin
          .from('user_profile')
          .update(merged)
          .eq('user_id', newUser.id)
        if (error) console.warn('[migrate] profile merge failed', error.message)

        // 旧プロファイルは削除 (PK 衝突を避けるため移転前に消す)
        await admin.from('user_profile').delete().eq('user_id', oldUserId)
        migrated.user_profile = 1
      } else {
        const { error } = await admin
          .from('user_profile')
          .update({ user_id: newUser.id })
          .eq('user_id', oldUserId)
        if (error) console.warn('[migrate] profile move failed', error.message)
        else migrated.user_profile = 1
      }
    }
  }

  // 4b. その他のテーブル: UPDATE user_id = new WHERE user_id = old
  const tables = [
    'tone_samples',
    'customers',
    'visit_logs',
    'conversation_memos',
    'generation_history',
    'conversation_threads',
    'conversation_thread_messages',
  ] as const

  for (const table of tables) {
    const { data, error } = await admin
      .from(table)
      .update({ user_id: newUser.id })
      .eq('user_id', oldUserId)
      .select('id')
    if (error) {
      console.warn(`[migrate] ${table} failed`, error.message)
      migrated[table] = -1
    } else {
      migrated[table] = data?.length ?? 0
    }
  }

  // 5. 旧匿名ユーザーをクリーンアップ。失敗してもブロックしない (次回起動時に問題なし)。
  const { error: deleteErr } = await admin.auth.admin.deleteUser(oldUserId)
  if (deleteErr) {
    console.warn('[migrate] deleteUser failed', deleteErr.message)
  }

  return { ok: true, migrated }
})
