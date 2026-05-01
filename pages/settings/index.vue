<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUserStore, type ProfileUpdates } from '~/stores/user'
import { useXPostHashtagsStore } from '~/stores/xPostHashtags'
import {
  INDUSTRY_OPTIONS,
  SAFETY_MODE_OPTIONS,
  isStableIndustry,
  type Industry,
  type SafetyMode,
  type ToneFeatures,
  type ToneFeatureSet,
} from '~/types/domain'

useHead({ title: '設定 | ヨルリプ' })

const userStore = useUserStore()
const hashtagStore = useXPostHashtagsStore()
const { profile, ngWords } = storeToRefs(userStore)
const { tags: xPostHashtags } = storeToRefs(hashtagStore)

const supabaseUser = useSupabaseUser()
const isAnonymous = computed(() => !supabaseUser.value?.email)
const userEmail = computed(() => supabaseUser.value?.email ?? null)

// ===== プロフィール編集 =================================
const draftIndustry = ref<Industry>(
  (profile.value?.industry as Industry) ?? 'concafe',
)
const draftGenjiName = ref(profile.value?.genji_name ?? '')
const draftSafety = ref<SafetyMode>(
  (profile.value?.safety_mode as SafetyMode) ?? 'normal',
)
const profileSaving = ref(false)
const profileMsg = ref<string | null>(null)

const profileChanged = computed(() => {
  if (!profile.value) return false
  return (
    draftIndustry.value !== profile.value.industry ||
    (draftGenjiName.value || null) !== (profile.value.genji_name ?? null) ||
    draftSafety.value !== profile.value.safety_mode
  )
})

async function saveProfile(): Promise<void> {
  if (!profileChanged.value) return
  profileSaving.value = true
  profileMsg.value = null
  try {
    await userStore.updateProfile({
      industry: draftIndustry.value,
      genji_name: draftGenjiName.value.trim() || null,
      safety_mode: draftSafety.value,
    })
    profileMsg.value = '保存しました ✓'
    setTimeout(() => (profileMsg.value = null), 2500)
  } catch (e: unknown) {
    profileMsg.value =
      (e as { message?: string })?.message ?? '保存に失敗しました'
  } finally {
    profileSaving.value = false
  }
}

// ===== NG語 ============================================
const ngDraft = ref<string[]>([...ngWords.value])
const ngInput = ref('')
const ngSaving = ref(false)
const ngMsg = ref<string | null>(null)

function addNg(): void {
  const w = ngInput.value.trim()
  if (!w) return
  if (ngDraft.value.includes(w)) {
    ngInput.value = ''
    return
  }
  ngDraft.value = [...ngDraft.value, w]
  ngInput.value = ''
}

function removeNg(w: string): void {
  ngDraft.value = ngDraft.value.filter((x) => x !== w)
}

const ngChanged = computed(() => {
  const current = ngWords.value
  if (ngDraft.value.length !== current.length) return true
  for (let i = 0; i < current.length; i++) {
    if (ngDraft.value[i] !== current[i]) return true
  }
  return false
})

async function saveNg(): Promise<void> {
  if (!ngChanged.value) return
  ngSaving.value = true
  ngMsg.value = null
  try {
    await userStore.updateProfile({ ng_words: ngDraft.value })
    ngMsg.value = '保存しました ✓'
    setTimeout(() => (ngMsg.value = null), 2500)
  } catch (e: unknown) {
    ngMsg.value = (e as { message?: string })?.message ?? '保存に失敗しました'
  } finally {
    ngSaving.value = false
  }
}

// ===== X 公開投稿用ハッシュタグ ===========================
// store の値は # を含まないタグ名のみ。表示時のみ # を頭に付ける。
const hashtagDraft = ref<string[]>([...xPostHashtags.value])
const hashtagInput = ref('')
const hashtagSaving = ref(false)
const hashtagMsg = ref<string | null>(null)

function addHashtag(): void {
  // 入力時の # は許容、保存時に store 側で正規化される
  const raw = hashtagInput.value.trim().replace(/^[#＃]+/, '').replace(/\s+/g, '')
  if (!raw) return
  if (hashtagDraft.value.includes(raw)) {
    hashtagInput.value = ''
    return
  }
  hashtagDraft.value = [...hashtagDraft.value, raw]
  hashtagInput.value = ''
}

function removeHashtag(t: string): void {
  hashtagDraft.value = hashtagDraft.value.filter((x) => x !== t)
}

const hashtagChanged = computed(() => {
  const current = xPostHashtags.value
  if (hashtagDraft.value.length !== current.length) return true
  for (let i = 0; i < current.length; i++) {
    if (hashtagDraft.value[i] !== current[i]) return true
  }
  return false
})

function saveHashtags(): void {
  if (!hashtagChanged.value) return
  hashtagSaving.value = true
  hashtagMsg.value = null
  try {
    // クライアントのみ管理(localStorage)。DB 同期はしない。
    hashtagStore.setAll(hashtagDraft.value)
    // 反映後の正規化済みリストで draft を更新
    hashtagDraft.value = [...hashtagStore.tags]
    hashtagMsg.value = '保存しました ✓'
    setTimeout(() => (hashtagMsg.value = null), 2500)
  } catch (e: unknown) {
    hashtagMsg.value = (e as { message?: string })?.message ?? '保存に失敗しました'
  } finally {
    hashtagSaving.value = false
  }
}

// ===== 口調学習サマリ ==================================
const toneFeatures = computed<ToneFeatures>(() => {
  const raw = profile.value?.tone_features
  return (raw && typeof raw === 'object' ? raw : {}) as ToneFeatures
})

// 口調学習は単一バケット ('dm') に統一されたため、件数表示もそこから引く
const unifiedToneSampleCount = computed<number | null>(() => {
  const set: ToneFeatureSet | undefined = toneFeatures.value.byChannel?.dm
  return set?.sampleCount ?? null
})

const toneMsg = ref<string | null>(null)

// ===== アカウント ======================================
const linkEmailInput = ref('')
const linkSubmitting = ref(false)
const linkMsg = ref<string | null>(null)

async function submitLinkEmail(): Promise<void> {
  const email = linkEmailInput.value.trim()
  if (!email) return
  linkSubmitting.value = true
  linkMsg.value = null
  try {
    await userStore.linkEmail(email)
    linkMsg.value =
      'メールを送信しました。受信箱のリンクをクリックすると連携完了です。'
    linkEmailInput.value = ''
  } catch (e: unknown) {
    linkMsg.value =
      (e as { message?: string })?.message ?? '送信に失敗しました'
  } finally {
    linkSubmitting.value = false
  }
}

// サインアウト処理は /admin ページに集約。/settings からは導線リンクのみ提供する。
</script>

<template>
  <section class="px-6 py-6 max-w-md mx-auto">
    <header class="mb-5 flex items-center justify-between">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-800 text-ink-50 text-xs px-3 py-1.5 hover:border-accent/40 transition active:scale-[.97]"
      >‹ ホーム</NuxtLink>
    </header>

    <h1 class="text-2xl font-bold mb-6">設定</h1>

    <!-- ============= プロフィール ============= -->
    <section class="mb-8">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">プロフィール</h2>
      <div class="rounded-2xl border border-ink-800 bg-ink-900 p-4 space-y-4">
        <div>
          <label class="block text-xs text-ink-400 mb-1.5">業種</label>
          <select
            v-model="draftIndustry"
            class="w-full rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm"
          >
            <!-- option タグ内に HTML バッジは置けないので "(開発中)" を文字列で付ける -->
            <option v-for="o in INDUSTRY_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}{{ o.stable ? '' : ' (開発中)' }}
            </option>
          </select>
          <p
            v-if="!isStableIndustry(draftIndustry)"
            class="mt-1.5 text-[11px] text-amber-300/80 leading-relaxed"
          >
            この業種は現在<strong>開発中</strong>です。生成品質がまだ安定していません。<br>
            まずは <strong>コンカフェ</strong> でお試しください。
          </p>
        </div>

        <div>
          <label class="block text-xs text-ink-400 mb-1.5">源氏名 (任意)</label>
          <input
            v-model="draftGenjiName"
            type="text"
            maxlength="40"
            class="w-full rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm"
          >
        </div>

        <div>
          <label class="block text-xs text-ink-400 mb-1.5">安全モード<br>(AIくんは下ネタが苦手。)</label>
          <div class="space-y-2">
            <label
              v-for="opt in SAFETY_MODE_OPTIONS"
              :key="opt.value"
              class="flex items-start gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition"
              :class="draftSafety === opt.value ? 'border-accent bg-accent/5' : 'border-ink-800'"
            >
              <input
                v-model="draftSafety"
                type="radio"
                :value="opt.value"
                class="mt-1 accent-pink-500"
              >
              <div>
                <div class="text-sm font-medium">{{ opt.label }}</div>
                <p class="mt-0.5 text-[11px] text-ink-400 leading-relaxed">{{ opt.description }}</p>
              </div>
            </label>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-xl bg-accent text-ink-950 font-semibold px-4 py-2 text-sm disabled:opacity-50"
            :disabled="!profileChanged || profileSaving"
            @click="saveProfile"
          >
            {{ profileSaving ? '保存中…' : 'プロフィールを保存' }}
          </button>
          <p v-if="profileMsg" class="text-xs text-accent-soft">{{ profileMsg }}</p>
        </div>
      </div>
    </section>

    <!-- ============= NG語 ============= -->
    <section class="mb-8">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">NG語</h2>
      <div class="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p class="text-[11px] text-ink-400 leading-relaxed mb-3">
          ここに登録した単語は生成文に含まれないようになります。<br>
          本名・店名・嫌いな言い回し等を入れてください。
        </p>

        <div class="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
          <span
            v-for="w in ngDraft"
            :key="w"
            class="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2.5 py-1 text-xs"
          >
            {{ w }}
            <button
              type="button"
              class="text-ink-400 hover:text-red-300 leading-none"
              aria-label="削除"
              @click="removeNg(w)"
            >×</button>
          </span>
          <span v-if="ngDraft.length === 0" class="text-[11px] text-ink-400">
            (まだ登録なし)
          </span>
        </div>

        <div class="flex gap-2">
          <input
            v-model="ngInput"
            type="text"
            placeholder="例: 本名"
            maxlength="40"
            class="flex-1 rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm"
            @keydown.enter.prevent="addNg"
          >
          <button
            type="button"
            class="rounded-xl bg-ink-800 text-ink-50 px-4 text-sm"
            :disabled="!ngInput.trim()"
            @click="addNg"
          >+ 追加</button>
        </div>

        <div class="flex items-center gap-3 mt-4">
          <button
            type="button"
            class="rounded-xl bg-accent text-ink-950 font-semibold px-4 py-2 text-sm disabled:opacity-50"
            :disabled="!ngChanged || ngSaving"
            @click="saveNg"
          >
            {{ ngSaving ? '保存中…' : 'NG語を保存' }}
          </button>
          <p v-if="ngMsg" class="text-xs text-accent-soft">{{ ngMsg }}</p>
        </div>
      </div>
    </section>

    <!-- ============= X 公開投稿用ハッシュタグ ============= -->
    <section class="mb-8">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">
        X 公開投稿用ハッシュタグ
      </h2>
      <div class="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p class="text-[11px] text-ink-400 leading-relaxed mb-3">
          X 公開投稿モードで生成した文の末尾に自動で付与されます。<br>
          生成画面でON/OFFを切り替えできます。# は付けずに登録してください。
        </p>

        <div class="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
          <span
            v-for="t in hashtagDraft"
            :key="t"
            class="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2.5 py-1 text-xs"
          >
            #{{ t }}
            <button
              type="button"
              class="text-ink-400 hover:text-red-300 leading-none"
              aria-label="削除"
              @click="removeHashtag(t)"
            >×</button>
          </span>
          <span v-if="hashtagDraft.length === 0" class="text-[11px] text-ink-400">
            (まだ登録なし)
          </span>
        </div>

        <div class="flex gap-2">
          <input
            v-model="hashtagInput"
            type="text"
            placeholder="例: コンカフェ"
            maxlength="50"
            class="flex-1 rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm"
            @keydown.enter.prevent="addHashtag"
          >
          <button
            type="button"
            class="rounded-xl bg-ink-800 text-ink-50 px-4 text-sm"
            :disabled="!hashtagInput.trim()"
            @click="addHashtag"
          >+ 追加</button>
        </div>

        <div class="flex items-center gap-3 mt-4">
          <button
            type="button"
            class="rounded-xl bg-accent text-ink-950 font-semibold px-4 py-2 text-sm disabled:opacity-50"
            :disabled="!hashtagChanged || hashtagSaving"
            @click="saveHashtags"
          >
            {{ hashtagSaving ? '保存中…' : 'ハッシュタグを保存' }}
          </button>
          <p v-if="hashtagMsg" class="text-xs text-accent-soft">{{ hashtagMsg }}</p>
        </div>
      </div>
    </section>

    <!-- ============= 口調学習 ============= -->
    <section class="mb-8">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">口調学習</h2>
      <div class="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p class="text-[11px] text-ink-400 leading-relaxed mb-3">
          普段送ってる文を 5 件以上覚えさせると、AI があなたの口調を真似してくれます。
          編集してコピーした文面も自動でサンプルに追加されます。
        </p>

        <NuxtLink
          to="/settings/tone"
          class="flex items-center justify-between rounded-xl bg-ink-950 border border-ink-800 px-3 py-2.5 hover:border-accent/40 transition active:scale-[.99]"
        >
          <div class="min-w-0">
            <div class="text-sm font-medium">口調サンプルを管理</div>
            <div class="text-[11px] text-ink-400">
              <template v-if="unifiedToneSampleCount === null || unifiedToneSampleCount === 0">
                未学習 — まずはサンプルを 5 件追加してください
              </template>
              <template v-else-if="unifiedToneSampleCount < 5">
                {{ unifiedToneSampleCount }} 件 / あと {{ 5 - unifiedToneSampleCount }} 件で学習スタート
              </template>
              <template v-else>
                {{ unifiedToneSampleCount }} 件 · 学習中 ✓
              </template>
            </div>
          </div>
          <span aria-hidden="true" class="text-ink-400">›</span>
        </NuxtLink>

        <p v-if="toneMsg" class="mt-3 text-xs text-accent-soft">{{ toneMsg }}</p>
      </div>
    </section>

    <!-- ============= アカウント ============= -->
    <section class="mb-8">
      <h2 class="text-[11px] uppercase tracking-wider text-ink-400 mb-2">アカウント</h2>
      <div class="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <div class="text-sm">
          <div v-if="userEmail" class="text-ink-50">
            連携済み: <span class="text-accent-soft">{{ userEmail }}</span>
          </div>
          <div v-else class="text-ink-400">
            匿名ユーザー (まだメールアドレスを連携していません)
          </div>
        </div>

        <!-- 匿名 → Magic Link 連携 -->
        <div v-if="isAnonymous" class="mt-4 space-y-2">
          <p class="text-[11px] text-ink-400 leading-relaxed">
            メールアドレスを連携すると別端末からも同じデータにアクセスできるようになります。<br>
            user_id は変わらないので、これまで貯めた客情報・口調はそのまま引き継がれます。
          </p>
          <div class="flex gap-2">
            <input
              v-model="linkEmailInput"
              type="email"
              placeholder="you@example.com"
              class="flex-1 rounded-xl bg-ink-950 border border-ink-800 px-3 py-2 text-sm"
            >
            <button
              type="button"
              class="rounded-xl bg-accent text-ink-950 font-semibold px-4 text-sm disabled:opacity-50"
              :disabled="!linkEmailInput.trim() || linkSubmitting"
              @click="submitLinkEmail"
            >
              {{ linkSubmitting ? '送信中…' : 'リンク送信' }}
            </button>
          </div>
          <p v-if="linkMsg" class="text-[11px] text-accent-soft leading-relaxed">{{ linkMsg }}</p>
        </div>

        <!-- アカウント管理画面への導線 -->
        <div class="mt-4 pt-4 border-t border-ink-800/60">
          <NuxtLink
            to="/admin"
            class="flex items-center justify-between rounded-xl bg-ink-950 border border-ink-800 px-3 py-2.5 hover:border-accent/40 transition active:scale-[.99]"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium">アカウント管理</div>
              <div class="text-[11px] text-ink-400">
                ログアウト / データ初期化 / アカウント完全削除
              </div>
            </div>
            <span aria-hidden="true" class="text-ink-400">›</span>
          </NuxtLink>
        </div>
      </div>
    </section>
  </section>
</template>
