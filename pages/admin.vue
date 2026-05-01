<script setup lang="ts">
import { useUserStore } from '~/stores/user'

useHead({ title: 'アカウント管理 | ヨルリプ' })
definePageMeta({
  pageTransition: { name: 'slide-left', mode: 'out-in', appear: false },
})

const userStore = useUserStore()
const router = useRouter()
const supabaseUser = useSupabaseUser()

const userEmail = computed(() => supabaseUser.value?.email ?? null)
const isAnonymous = computed(() => !supabaseUser.value?.email)
const userId = computed(() => supabaseUser.value?.id ?? '—')

// ----- ログアウト ----------------------------------------
const signingOut = ref(false)
const signOutError = ref<string | null>(null)

async function handleSignOut(): Promise<void> {
  if (
    !window.confirm(
      isAnonymous.value
        ? 'ゲストモードでログアウトすると、次回起動時に新しい匿名ユーザーが払い出され、現在の客情報・口調・スレッド等は見えなくなります。本当にログアウトしますか?\n\n(連携メールを送って本登録すれば、データを保ったままログイン状態に出来ます)'
        : 'ログアウトしますか?次回ログイン時に再度メールでマジックリンクが必要になります。',
    )
  )
    return
  signingOut.value = true
  signOutError.value = null
  try {
    await userStore.signOut()
    await router.replace('/')
    // 完全にクリーンな状態で再起動するためリロード
    if (typeof window !== 'undefined') window.location.reload()
  } catch (e: unknown) {
    signOutError.value =
      (e as { message?: string })?.message ?? 'ログアウトに失敗しました'
  } finally {
    signingOut.value = false
  }
}

// ----- データ初期化 (プロフィールは残す) -----------------
const resetting = ref(false)
const resetError = ref<string | null>(null)
const resetMsg = ref<string | null>(null)

async function handleResetData(): Promise<void> {
  const phrase = window.prompt(
    '【データを初期化】\n' +
      '客 / 会話スレッド / 口調サンプル / 生成履歴 を全て削除します。\n' +
      'プロフィール (業種・源氏名・安全モード) は残ります。\n' +
      '元に戻せません。\n\n' +
      '実行する場合は「初期化」と入力してください:',
  )
  if (phrase !== '初期化') return

  resetting.value = true
  resetError.value = null
  resetMsg.value = null
  try {
    const res = await $fetch<{
      ok: true
      deleted: Record<string, number | null>
    }>('/api/auth/reset-data', { method: 'POST' })
    const total = Object.values(res.deleted).reduce<number>(
      (acc, n) => acc + (typeof n === 'number' ? n : 0),
      0,
    )
    resetMsg.value = `${total} 件のデータを削除しました ✓`
  } catch (e: unknown) {
    resetError.value =
      (e as { data?: { statusMessage?: string }; message?: string })?.data
        ?.statusMessage ??
      (e as { message?: string })?.message ??
      '初期化に失敗しました'
  } finally {
    resetting.value = false
  }
}

// ----- アカウント完全削除 -------------------------------
const deleting = ref(false)
const deleteError = ref<string | null>(null)

async function handleDeleteAccount(): Promise<void> {
  const phrase = window.prompt(
    '【アカウントを完全削除】\n' +
      'このアカウントと、紐づく全データ (客 / スレッド / 口調 / 履歴等) を完全に削除します。\n' +
      '元に戻せません。同じメールアドレスで再登録すれば新規アカウントになります。\n\n' +
      '実行する場合は「完全削除」と入力してください:',
  )
  if (phrase !== '完全削除') return

  deleting.value = true
  deleteError.value = null
  try {
    await $fetch('/api/auth/delete-account', { method: 'POST' })
    // サーバ側で auth.users が消えたのでセッションを破棄して再起動
    try {
      await userStore.signOut()
    } catch (e) {
      // signOut が失敗しても (もう存在しない user なので) 続行
      console.warn('[delete-account] signOut after delete failed', e)
    }
    await router.replace('/')
    if (typeof window !== 'undefined') window.location.reload()
  } catch (e: unknown) {
    deleteError.value =
      (e as { data?: { statusMessage?: string }; message?: string })?.data
        ?.statusMessage ??
      (e as { message?: string })?.message ??
      '削除に失敗しました'
    deleting.value = false
  }
}
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto pb-12">
    <header class="mb-5 flex items-center justify-between">
      <NuxtLink
        to="/settings"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ 設定</NuxtLink>
    </header>

    <h1 class="text-xl font-bold mb-1">アカウント管理</h1>
    <p class="text-xs text-ink-400 mb-6">ログアウト / データの削除 / アカウント削除</p>

    <!-- ===== 現在のアカウント情報 ===== -->
    <section class="mb-6 rounded-2xl border border-ink-800 bg-ink-900 p-4 space-y-2">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400">現在のアカウント</h2>
      <dl class="text-xs space-y-1.5">
        <div class="flex gap-3">
          <dt class="text-ink-400 w-20 shrink-0">状態</dt>
          <dd>
            <span
              v-if="isAnonymous"
              class="rounded-full border border-amber-400/40 px-2 py-0.5 text-amber-300"
            >ゲストモード</span>
            <span
              v-else
              class="rounded-full border border-accent/40 px-2 py-0.5 text-accent-soft"
            >本登録済み</span>
          </dd>
        </div>
        <div class="flex gap-3">
          <dt class="text-ink-400 w-20 shrink-0">メール</dt>
          <dd class="break-all">{{ userEmail ?? '(未連携)' }}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="text-ink-400 w-20 shrink-0">user id</dt>
          <dd class="break-all text-ink-400/80 text-[10px] font-mono">{{ userId }}</dd>
        </div>
      </dl>
    </section>

    <!-- ===== ログアウト ===== -->
    <section class="mb-6 rounded-2xl border border-ink-800 bg-ink-900 p-4 space-y-3">
      <div>
        <h2 class="text-sm font-semibold mb-1">🚪 ログアウト</h2>
        <p class="text-[11px] text-ink-400 leading-relaxed">
          <span v-if="isAnonymous">
            ゲストモードのままログアウトすると、次回起動時に <strong>新しい匿名ユーザー</strong> が払い出されて現在のデータは見えなくなります。データを保ったまま使い続けたい場合は、先に <NuxtLink to="/settings" class="text-accent-soft underline">アカウント連携</NuxtLink> してください。
          </span>
          <span v-else>
            ログアウトすると、再度ログインするまでアプリは使えません。データは残ります。
          </span>
        </p>
      </div>

      <p v-if="signOutError" class="text-xs text-red-400">{{ signOutError }}</p>

      <button
        type="button"
        class="w-full rounded-xl bg-ink-800 text-ink-50 text-sm font-medium py-2.5 disabled:opacity-50 active:scale-[.99] transition border border-ink-700 hover:border-ink-700/60"
        :disabled="signingOut"
        @click="handleSignOut"
      >{{ signingOut ? 'ログアウト中…' : 'ログアウト' }}</button>
    </section>

    <!-- ===== データ初期化 ===== -->
    <section class="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
      <div>
        <h2 class="text-sm font-semibold mb-1 text-amber-300">⚠️ データを初期化</h2>
        <p class="text-[11px] text-ink-400 leading-relaxed">
          客情報 / 会話スレッド / 口調サンプル / 生成履歴 を全て削除します。<br>
          プロフィール (業種・源氏名・安全モード) は残るので、再オンボーディングは不要です。
          <br>
          <strong class="text-amber-300">この操作は元に戻せません。</strong>
        </p>
      </div>

      <p v-if="resetMsg" class="text-xs text-accent-soft">{{ resetMsg }}</p>
      <p v-if="resetError" class="text-xs text-red-400">{{ resetError }}</p>

      <button
        type="button"
        class="w-full rounded-xl bg-amber-500/20 text-amber-200 text-sm font-medium py-2.5 disabled:opacity-50 active:scale-[.99] transition border border-amber-400/40 hover:bg-amber-500/30"
        :disabled="resetting"
        @click="handleResetData"
      >{{ resetting ? '削除中…' : '全データを初期化' }}</button>
    </section>

    <!-- ===== アカウント完全削除 ===== -->
    <section class="mb-6 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 space-y-3">
      <div>
        <h2 class="text-sm font-semibold mb-1 text-red-300">💥 アカウントを完全削除</h2>
        <p class="text-[11px] text-ink-400 leading-relaxed">
          このアカウント (auth.users 上のレコード) と、紐づく <strong>全データ</strong> (客 / スレッド / 口調 / 履歴等) を消去します。<br>
          <strong class="text-red-300">この操作は元に戻せません。</strong> 同じメールアドレスで後日再登録すると、新規アカウントとして始まります。
        </p>
      </div>

      <p v-if="deleteError" class="text-xs text-red-400">{{ deleteError }}</p>

      <button
        type="button"
        class="w-full rounded-xl bg-red-500/20 text-red-200 text-sm font-semibold py-2.5 disabled:opacity-50 active:scale-[.99] transition border border-red-500/40 hover:bg-red-500/30"
        :disabled="deleting"
        @click="handleDeleteAccount"
      >{{ deleting ? '削除中…' : 'アカウントを完全削除' }}</button>
    </section>
  </section>
</template>
