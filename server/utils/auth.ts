import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from '#supabase/server'
import { useRuntimeConfig } from '#imports'
import type { User } from '@supabase/supabase-js'
import type { Database } from '~/types/db'

/**
 * JWT/JWE トークンを Supabase auth API で検証してユーザーを返す。
 *
 * 新しい Supabase の publishable key + 暗号化 JWE access_token (5 parts) は
 * クライアント側で復号できないため、auth API に投げて復号 + 検証してもらう。
 * JWE 復号には service_role 権限が必要なので、anon key ではなく
 * SUPABASE_SERVICE_KEY を apikey として使う。
 *
 * 失敗したら anon key 経由 (legacy 3-part JWT 想定) でフォールバック。
 */
async function verifyTokenViaUserApi(
  event: H3Event,
  token: string,
): Promise<User | null> {
  // 診断: token の構造を確認 (JWT は 3 parts、JWE は 5 parts)
  const parts = token.split('.')
  console.info(
    '[auth] token parts count=',
    parts.length,
    '| lengths=',
    parts.map((p) => p.length),
  )

  const config = useRuntimeConfig(event)
  const url = config.public.supabase?.url as string | undefined
  if (!url) {
    console.error('[auth] supabase url not configured')
    return null
  }

  // 1. service_role 経由 (JWE 暗号化トークン対応)
  let serviceKey: string | undefined
  try {
    // 既存の serverSupabaseServiceRole は SupabaseClient を返すが、
    // ここで欲しいのは生 key 値なので runtimeConfig から直接読む
    serviceKey = (config.supabase as { serviceKey?: string } | undefined)?.serviceKey
  } catch {
    /* ignore */
  }
  if (serviceKey) {
    try {
      const client = createClient<Database>(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      })
      const { data, error } = await client.auth.getUser()
      if (!error && data?.user) {
        return data.user
      }
      if (error) {
        console.warn('[auth/getUser/service] rejected:', error.status, error.message)
      }
    } catch (e) {
      console.warn('[auth/getUser/service] threw:', e)
    }
  } else {
    console.warn('[auth] no service key — JWE 復号できない可能性')
  }

  // 2. anon key 経由 (legacy 3-part JWT 用)
  const anonKey = config.public.supabase?.key as string | undefined
  if (!anonKey) return null
  try {
    const client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })
    const { data, error } = await client.auth.getUser()
    if (!error && data?.user) return data.user
    if (error) {
      console.warn('[auth/getUser/anon] rejected:', error.status, error.message)
    }
  } catch (e) {
    console.warn('[auth/getUser/anon] threw:', e)
  }
  // serverSupabaseServiceRole は型整合性のため使われていないと unused 扱いになるので
  // 参照するだけで握りつぶす (実際の admin api 呼び出しは createClient 経由で実施)
  void serverSupabaseServiceRole
  return null
}

/**
 * Nitro エンドポイントでの認証ユーザー取得。
 *
 * このアプリは `useSsrCookies: false` で session を localStorage に持つため、
 * クッキー経由の認証はブラウザが残した残留クッキー次第で不安定。
 * クライアントから Authorization: Bearer <access_token> を送る前提で:
 *
 *   1. Authorization ヘッダーから JWT を取り出し、anon クライアントで getUser(jwt) 検証
 *   2. クッキー経由 (@nuxtjs/supabase の serverSupabaseUser) フォールバック
 *
 * いずれも失敗したら null を返す。呼び出し元が 401 を投げる。
 *
 * 注意: Supabase の `auth.getUser(jwt)` は JWT を auth サーバに照会して
 * ユーザー情報を返す。expired / 改竄されたトークンはここで弾かれる。
 */
export async function getAuthUser(event: H3Event): Promise<User | null> {
  // 1. Authorization ヘッダー (推奨パス) — JWT を Supabase auth API で検証
  const authHeader = getHeader(event, 'authorization')
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token) {
      const user = await verifyTokenViaUserApi(event, token)
      if (user) return user
    }
  }

  // 2. Cookie ベース (フォールバック)
  try {
    const user = await serverSupabaseUser(event)
    if (user) return user
  } catch {
    /* ignore */
  }

  return null
}

/**
 * Authorization ヘッダーから JWT を取り出して、それを Authorization に
 * セットした Supabase client を作る。RLS が `auth.uid() = user_id` で
 * 効くようにするため、queries はこのクライアント経由で行う。
 *
 * 用途: 認証済みエンドポイントで、ユーザー所有データの読み書きをするとき。
 * (`@nuxtjs/supabase` の `serverSupabaseClient` は cookie ベースなので
 *  `useSsrCookies: false` の本アプリでは auth context が無くなり、RLS で
 *  全行弾かれる。これを回避するためのヘルパー)
 */
export function getAuthClient(event: H3Event): SupabaseClient<Database> | null {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) return null
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const config = useRuntimeConfig(event)
  const url = config.public.supabase?.url as string | undefined
  const anonKey = config.public.supabase?.key as string | undefined
  if (!url || !anonKey) return null

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  })
}
