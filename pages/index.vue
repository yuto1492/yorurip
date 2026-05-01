<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUserStore } from '~/stores/user'
import {
  INDUSTRY_OPTIONS,
  isStableIndustry,
  type GenerationMode,
  type Industry,
} from '~/types/domain'

useHead({ title: 'ヨルリプ' })

const userStore = useUserStore()
const { profile, isOnboarded } = storeToRefs(userStore)

const industryLabel = computed(
  () => INDUSTRY_OPTIONS.find(o => o.value === profile.value?.industry)?.label ?? '',
)
const isIndustryStable = computed(() =>
  isStableIndustry(profile.value?.industry as Industry | undefined),
)

// ----- ゲストモード判定とアカウント連携 ---------------------
const supabaseUser = useSupabaseUser()
// email が無い = 匿名サインインのまま(まだ正規登録していない)
const isAnonymous = computed(
  () => !!supabaseUser.value?.id && !supabaseUser.value?.email,
)

const showRegister = ref(false)
const emailInput = ref('')
const submittingRegister = ref(false)
const registerMessage = ref<string | null>(null)
const registerSucceeded = ref(false)

async function submitRegister(): Promise<void> {
  const email = emailInput.value.trim()
  if (!email || submittingRegister.value) return
  submittingRegister.value = true
  registerMessage.value = null
  try {
    await userStore.linkEmail(email)
    registerSucceeded.value = true
    registerMessage.value =
      '✓ 確認メールを送信しました。受信箱のリンクをクリックすると登録完了です(同じ user_id のままなので、これまでの客管理・口調学習はそのまま引き継がれます)'
    emailInput.value = ''
  } catch (e: unknown) {
    registerMessage.value =
      (e as { message?: string })?.message ?? '送信に失敗しました'
  } finally {
    submittingRegister.value = false
  }
}

// ----- ログイン (既存アカウントに切替) ---------------------
const showLogin = ref(false)
const loginEmailInput = ref('')
const submittingLogin = ref(false)
const loginMessage = ref<string | null>(null)
const loginSucceeded = ref(false)

async function submitLogin(): Promise<void> {
  const email = loginEmailInput.value.trim()
  if (!email || submittingLogin.value) return
  submittingLogin.value = true
  loginMessage.value = null
  try {
    await userStore.signInWithEmail(email)
    loginSucceeded.value = true
    loginMessage.value =
      '✓ ログイン用リンクを送信しました。受信箱のリンクをクリックするとログイン完了です'
    loginEmailInput.value = ''
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message ?? ''
    if (/Signups not allowed|user not found|not exist/i.test(msg)) {
      loginMessage.value =
        'このメールアドレスでは登録されていません。「アカウント登録してデータを保護」から新規登録してください。'
    } else {
      loginMessage.value = msg || '送信に失敗しました'
    }
  } finally {
    submittingLogin.value = false
  }
}

// ホームの導線カード。
//   mode を持つ → /generate?mode=... に遷移
//   path を持つ → 専用ページに直遷移 (例: 客と会話 = スレッドUI)
interface ModeCard {
  key: string
  title: string
  desc: string
  emoji: string
  mode?: GenerationMode
  path?: string
}

const MODES: ModeCard[] = [
  {
    key: 'reply',
    mode: 'reply',
    title: '単発返信',
    desc: '相手の文面を貼って簡単返信',
    emoji: '💬',
  },
  {
    key: 'thanks',
    mode: 'thanks',
    title: 'お礼/感謝',
    desc: '来店後のお礼',
    emoji: '🌸',
  },
  {
    key: 'threads',
    path: '/threads',
    title: '客と会話',
    desc: '会話の流れを覚えてくれる楽々会話',
    emoji: '🗨️',
  },
  {
    key: 'public_post',
    mode: 'public_post',
    title: '公開投稿',
    desc: 'X タイムライン投稿',
    emoji: '✨',
  },
  {
    key: 'personal',
    mode: 'personal',
    title: '営業: 個人',
    desc: '登録した客情報に合わせた個別最適化',
    emoji: '🎯',
  },
  {
    key: 'general',
    mode: 'general',
    title: '営業: 汎用',
    desc: '一斉送信向け / シーン指定',
    emoji: '📣',
  },
]

function modeCardTo(m: ModeCard): string | { path: string; query: Record<string, string> } {
  if (m.path) return m.path
  return { path: '/generate', query: { mode: m.mode as string } }
}
</script>

<template>
  <section class="px-6 py-10 max-w-md mx-auto">
    <header class="mb-6 flex items-end justify-between">
      <div>
        <p class="text-accent text-xs font-medium tracking-wide">ヨルリプ</p>
        <h1 class="mt-1 text-2xl font-bold leading-tight">何する?</h1>
      </div>
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button
          v-if="isAnonymous && isOnboarded"
          type="button"
          class="text-[11px] font-semibold text-ink-950 bg-amber-300 border border-amber-300 rounded-full px-2.5 py-1 hover:bg-amber-200 active:scale-[.97] transition"
          @click="showLogin = true"
        >ログイン</button>
        <NuxtLink
          to="/customers"
          class="text-[11px] text-ink-50 bg-ink-900 border border-ink-800 rounded-full px-2.5 py-1 hover:border-accent/40"
        >客管理</NuxtLink>
        <NuxtLink
          to="/settings/tone"
          class="text-[11px] text-ink-50 bg-ink-900 border border-ink-800 rounded-full px-2.5 py-1 hover:border-accent/40"
        >口調学習</NuxtLink>
        <NuxtLink
          to="/settings"
          class="text-[11px] text-ink-50 bg-ink-900 border border-ink-800 rounded-full px-2.5 py-1 hover:border-accent/40"
          aria-label="設定"
        >設定</NuxtLink>
        <span
          v-if="isOnboarded"
          class="text-[11px] bg-ink-900 border rounded-full px-2.5 py-1"
          :class="isIndustryStable
            ? 'text-ink-400 border-ink-800'
            : 'text-amber-300/90 border-amber-400/40'"
        >
          {{ industryLabel }}<span v-if="!isIndustryStable"> · 開発中</span>
        </span>
      </div>
    </header>

    <ul class="space-y-2.5">
      <li v-for="m in MODES" :key="m.key">
        <NuxtLink
          :to="modeCardTo(m)"
          class="block w-full text-left rounded-2xl border border-ink-800 bg-ink-900 px-4 py-4 transition active:scale-[.99] hover:border-ink-800/60"
        >
          <div class="flex items-center gap-3">
            <span class="text-xl" aria-hidden="true">{{ m.emoji }}</span>
            <div class="flex-1">
              <div class="font-semibold">{{ m.title }}</div>
              <p class="mt-0.5 text-xs text-ink-400">{{ m.desc }}</p>
            </div>
            <span aria-hidden="true" class="text-ink-400">›</span>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <!-- ゲストモード警告 / アカウント登録 / ログイン (画面最下部) -->
    <div
      v-if="isAnonymous && isOnboarded"
      class="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4"
    >
      <div class="flex items-start gap-2">
        <span class="text-amber-300 text-base shrink-0" aria-hidden="true">⚠️</span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-amber-300">
            ゲストモードで利用中
          </p>
          <p class="mt-1 text-[11px] text-ink-400 leading-relaxed">
            データはこの端末にのみ紐付いています。<br>
            <strong class="text-ink-50">ブラウザのデータが消えると過去の客管理・口調学習が失われます。</strong>
          </p>

          <!-- ボタン群 (折り畳み未展開時) -->
          <div v-if="!showRegister && !showLogin" class="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-full bg-amber-400 text-ink-950 text-xs font-semibold px-4 py-1.5 active:scale-[.97] transition"
              @click="showRegister = true"
            >
              アカウント登録してデータを保護
            </button>
            <button
              type="button"
              class="rounded-full bg-ink-800 text-ink-50 text-xs font-medium px-4 py-1.5 border border-ink-700 active:scale-[.97] transition"
              @click="showLogin = true"
            >
              既存アカウントでログイン
            </button>
          </div>

          <!-- 新規登録フォーム -->
          <div v-else-if="showRegister" class="mt-3 space-y-2">
            <p class="text-[11px] text-amber-300/90 font-medium">新規アカウント登録</p>
            <input
              v-model="emailInput"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm"
              :disabled="submittingRegister || registerSucceeded"
              @keydown.enter.prevent="submitRegister"
            >
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 rounded-xl bg-amber-400 text-ink-950 text-xs font-semibold py-2 disabled:opacity-50 active:scale-[.99] transition"
                :disabled="!emailInput.trim() || submittingRegister || registerSucceeded"
                @click="submitRegister"
              >
                {{ submittingRegister ? '送信中…' : registerSucceeded ? '送信済' : '確認メールを送信' }}
              </button>
              <button
                type="button"
                class="rounded-xl bg-ink-800 text-ink-400 text-xs px-3"
                :disabled="submittingRegister"
                @click="showRegister = false; registerMessage = null; registerSucceeded = false"
              >
                閉じる
              </button>
            </div>
            <p
              v-if="registerMessage"
              class="text-[11px] leading-relaxed"
              :class="registerSucceeded ? 'text-amber-300/90' : 'text-red-400'"
            >
              {{ registerMessage }}
            </p>
            <p class="text-[10px] text-ink-400/80 leading-relaxed">
              💡 メールアドレス連携時に user_id は変わらないので、これまでのデータはそのまま使えます。
            </p>
          </div>

          <!-- ログインフォーム -->
          <div v-else-if="showLogin" class="mt-3 space-y-2">
            <p class="text-[11px] text-amber-300/90 font-medium">既存アカウントへログイン</p>
            <input
              v-model="loginEmailInput"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm"
              :disabled="submittingLogin || loginSucceeded"
              @keydown.enter.prevent="submitLogin"
            >
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 rounded-xl bg-amber-300 text-ink-950 text-xs font-semibold py-2 disabled:opacity-50 active:scale-[.99] transition"
                :disabled="!loginEmailInput.trim() || submittingLogin || loginSucceeded"
                @click="submitLogin"
              >
                {{ submittingLogin ? '送信中…' : loginSucceeded ? '送信済' : 'ログイン用リンクを送信' }}
              </button>
              <button
                type="button"
                class="rounded-xl bg-ink-800 text-ink-400 text-xs px-3"
                :disabled="submittingLogin"
                @click="showLogin = false; loginMessage = null; loginSucceeded = false"
              >
                閉じる
              </button>
            </div>
            <p
              v-if="loginMessage"
              class="text-[11px] leading-relaxed"
              :class="loginSucceeded ? 'text-amber-300/90' : 'text-red-400'"
            >
              {{ loginMessage }}
            </p>
            <p class="text-[10px] text-ink-400/80 leading-relaxed">
              ⚠️ ログインすると、現在のゲストモードで作成したデータは見えなくなります(既存アカウントのデータに切り替わります)。
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
