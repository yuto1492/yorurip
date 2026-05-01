# ヨルリプ (YoruRip) — 実装指示書

このリポジトリの実装を Claude Code で進めるための指示書。
**Claude Code はまずこのREADME.mdを読み、指示通りに進めること。**

## このプロジェクトについて

**ヨルリプ** は、夜職・コンカフェ向けのAI営業文面生成Webアプリ。
顧客カルテとユーザー本人の口調を学習し、4チャネル(LINE/X DM/IG DM/X公開投稿)に最適化された文面を生成する。

## ドキュメント読み込み順

実装着手前に、必ず以下の順で読むこと:

1. **`CLAUDE.md`** — プロダクト全体仕様。データモデル、API設計、機能スコープ
2. **`LLM_STRATEGY.md`** — LLM選定、コスト戦略、キャッシュ最適化
3. **`PROMPTS.md`** — プロンプト体系、業種ペルソナ、Tool Use定義

すべて読み終えてから実装計画を立てること。途中で迷ったらこの3ファイルに戻る。

## 実装フェーズ

以下のフェーズ順に進める。各フェーズ完了時にユーザーに確認を取り、次に進む。

### フェーズ0: プロジェクト初期化

- [ ] Nuxt 3 + TypeScript プロジェクトを作成 (`yarn create nuxt yorurip`)
- [ ] 必要な依存関係をインストール:
    - `@pinia/nuxt`, `pinia-plugin-persistedstate`
    - `@nuxtjs/tailwindcss`
    - `@nuxt/image` (IPX provider)
    - `@vite-pwa/nuxt`
    - `@supabase/supabase-js`, `@nuxtjs/supabase`
    - `@anthropic-ai/sdk`
    - `dexie`
    - `@sentry/nuxt`
- [ ] `.env.example` を作成:
    - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
    - `ANTHROPIC_API_KEY`
    - `SENTRY_DSN`
- [ ] ディレクトリ構成を `CLAUDE.md` の通りに作成

### フェーズ1: データベース構築

- [ ] Supabaseプロジェクトを作成 (ユーザー手動)
- [ ] マイグレーションSQL作成 (`/supabase/migrations/`)
    - `users`, `user_profile`, `tone_samples`, `customers`, `visit_logs`, `conversation_memos`, `generation_history` 全7テーブル
    - `CLAUDE.md` のER図に厳密に従う
- [ ] **全テーブルにRLS必須**: `auth.uid() = user_id` ポリシー
- [ ] Anonymous Sign-In を有効化
- [ ] Google OAuth プロバイダ設定 (ユーザー手動)
- [ ] Email Magic Link 設定 (ユーザー手動)
- [ ] Dexieスキーマ (`/db/schema.ts`) を Supabaseと同じ構造で定義

**注意**: ユーザー作業が必要な箇所は手順をMarkdownで出力し、ユーザーに依頼すること。勝手にSupabaseダッシュボードを操作しようとしないこと。

### フェーズ2: 認証フロー

- [ ] `pages/login.vue` 実装
- [ ] アプリ起動時の自動Anonymous Sign-In実装 (`plugins/auth.client.ts`)
- [ ] Google OAuth + Magic Link ログインボタン
- [ ] 匿名→正規アカウント昇格処理 (`composables/useAuth.ts`)
- [ ] `stores/user.ts` で認証状態管理

### フェーズ3: プロンプト基盤実装 (最重要)

`PROMPTS.md` の「ファイル分割の推奨」セクションに従って実装する。

- [ ] `server/utils/prompts/preamble.ts` — [1]共通プリアンブル
- [ ] `server/utils/prompts/personas/` — 5業種ペルソナ
    - `concafe.ts`, `kyaba.ts`, `host.ts`, `fuzoku.ts`, `generic.ts`
- [ ] `server/utils/prompts/channels/` — 4チャネルガイド
    - `line.ts`, `x_dm.ts`, `ig_dm.ts`, `x_post.ts`
- [ ] `server/utils/prompts/safety/` — 2安全モード
    - `safe.ts`, `loose.ts`
- [ ] `server/utils/prompts/modes/` — 5モード
    - `general.ts`, `personal.ts`, `reply.ts`, `thanks.ts`, `public_post.ts`
- [ ] `server/utils/prompts/tools.ts` — Tool Use定義
- [ ] `server/utils/prompts/output_format.ts` — 出力フォーマット
- [ ] `server/utils/prompts/user_block.ts` — ユーザー情報動的生成
- [ ] `server/utils/prompts/customer_block.ts` — 顧客カルテ動的生成
- [ ] `server/utils/prompts/index.ts` — `buildSystemPrompt` メイン関数

**重要**: PROMPTS.mdに記載されたテキストを**そのまま定数として埋め込む**。意訳や要約は禁止。
キャッシュブロック設計通り `cache_control: { type: 'ephemeral' }` を付与する。

### フェーズ4: 生成API実装

- [ ] `server/utils/claude.ts` — Claude APIクライアント (Anthropic SDK)
    - フェーズ1ではモデル `claude-opus-4-7` 固定 (LLM_STRATEGY.mdの方針)
    - ストリーミング対応
    - Tool Use のレスポンスをパース
- [ ] `server/api/generate.post.ts` — メイン生成エンドポイント
    - 入力バリデーション (Zod推奨)
    - `buildSystemPrompt` 呼び出し
    - Claude API実行
    - レート制限 10回/分/ユーザー
    - `generation_history` に記録
- [ ] `server/api/copy-event.post.ts` — 編集後コピー記録
    - 編集後文面を `tone_samples` に保存
    - チャネル別に分けて保存
- [ ] `server/api/tone/analyze.post.ts` — 口調特徴抽出
    - サンプル5件以上で起動
    - Sonnet 4.6使用 (バックグラウンド処理)
    - `user_profile.tone_features` を更新
- [ ] `server/api/customers/approve.post.ts` — 承認カードからのカルテ書込
- [ ] `server/api/customers/[id].{get,patch,delete}.ts` — カルテCRUD
- [ ] `server/api/customers/index.{get,post}.ts` — 一覧・新規作成

### フェーズ5: フロントエンド実装

優先度順:

- [ ] `pages/index.vue` — ホーム (顧客一覧 + 生成モード選択)
- [ ] `pages/onboarding.vue` — 業種選択(3秒で完了)
- [ ] `pages/generate/[mode].vue` — 4モード共通の生成画面
    - チャネル選択
    - 顧客選択 (個人/返信/お礼の場合)
    - シーン選択 / 入力欄
    - 3案表示・編集・コピーボタン
- [ ] `pages/customers/index.vue` — カルテ一覧
- [ ] `pages/customers/[id].vue` — カルテ詳細・編集
- [ ] `pages/customers/new.vue` — カルテ手動新規作成
- [ ] `pages/settings.vue` — 安全モード切替、口調再学習、NG語、プラン
- [ ] `components/ApprovalCard.vue` — Tool Use提案の承認UI
- [ ] `components/ChannelPicker.vue` — チャネル選択
- [ ] `components/GenerationResult.vue` — 3案表示+コピー
- [ ] `components/CustomerForm.vue` — カルテ入力フォーム

### フェーズ6: PWA化

- [ ] `nuxt.config.ts` で `@vite-pwa/nuxt` 有効化
- [ ] manifest設定 (アイコン・テーマカラー・ホーム画面追加対応)
- [ ] Service Worker設定 (オフライン時の最低限のキャッシュ)
- [ ] iOS Safari対応の `apple-touch-icon` 等

### フェーズ7: テスト・QA

`PROMPTS.md` の「テスト観点」セクションの8パターンを実行:

1. コンカフェ x X DM x 個人営業
2. コンカフェ x X 公開投稿 x 公開投稿
3. キャバ x LINE x お礼
4. ホスト x LINE x 返信
5. コンカフェ x X DM x 返信(safe)
6. コンカフェ x X DM x 返信(loose)
7. キャバ x LINE x 個人営業(口調学習済み)
8. NG語含む顧客カルテでの出力除外確認

各テストで以下を確認:
- 業種特有の語彙が使われている
- チャネル別の長さ・絵文字密度が適切
- 顧客カルテ情報が織り込まれている
- NG語が出力されていない
- 安全モードのポリシーが守られている

### フェーズ8: デプロイ

- [ ] Vercelプロジェクト作成 (ユーザー手動)
- [ ] 環境変数設定
- [ ] Sentry連携
- [ ] Plausible連携 (任意)
- [ ] 本番デプロイ

## 実装方針(全フェーズ共通)

### コード品質
- TypeScriptは `strict: true`
- ESLint + Prettier導入
- 型定義は `/types/` に集約
- DBの型は Supabase の型生成を使う (`supabase gen types typescript`)

### セキュリティ
- **Claude APIキーはサーバー側のみ**。クライアントに絶対露出しない
- すべてのSupabaseテーブルでRLS必須
- レート制限を `/api/generate` に必ず実装
- Cookie/JWT は `Secure; HttpOnly; SameSite=Lax`

### パフォーマンス
- システムプロンプトは必ずキャッシュ対象 (LLM_STRATEGY.md参照)
- ストリーミング応答でユーザー体感速度を上げる
- DexieはSupabase到達不可時のフォールバック+下書き保管に限定

### 業種固有の配慮
- コンカフェの顧客には「指名」「同伴」「アフター」用語を出さない (UIレベルで非表示)
- 業種選択により表示用語と機能を切替する

## ユーザー(プロダクトオーナー)が手動で行う作業

実装中、Claude Codeから以下を依頼されたら手動対応する:

1. Supabaseプロジェクト作成・APIキー取得
2. Google OAuth設定
3. Anthropic APIキー取得
4. Vercelプロジェクト作成・デプロイ
5. ドメイン設定
6. Sentry/Plausibleアカウント作成

これらは Claude Code の権限外なので、必要なタイミングで手順書付きで依頼するよう指示すること。

## 進捗管理

各フェーズ完了時に `PROGRESS.md` を更新する。フォーマット:

```
## フェーズ N: [名前]
- 完了日: YYYY-MM-DD
- 実装内容:
  - ...
- 次フェーズ前に確認事項:
  - ...
```

## トラブル時の判断基準

- **仕様で迷ったら**: `CLAUDE.md` を優先、それでも不明ならユーザーに確認
- **プロンプト品質に問題があったら**: `PROMPTS.md` を勝手に書き換えず、ユーザーに報告
- **コストが想定を超えたら**: `LLM_STRATEGY.md` のフェーズ移行判断をユーザーと相談
- **業種固有の文化に迷ったら**: `PROMPTS.md` の業種ペルソナを参照、それでも不明ならユーザーに確認

## ドキュメント更新ルール

- `CLAUDE.md` `LLM_STRATEGY.md` `PROMPTS.md` を編集した場合、各ファイル末尾の改訂履歴に追記
- 大きな仕様変更はユーザーに事前確認

---

**実装を始める前に、必ず CLAUDE.md → LLM_STRATEGY.md → PROMPTS.md の順で全文を読んでから着手すること。**