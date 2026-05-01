# Supabase スキーマ運用

`supabase/migrations/` にあるSQLを Supabase プロジェクトに順番に適用する。

## 構成

| ファイル | 役割 |
|---|---|
| `0001_init.sql` | テーブル + インデックス |
| `0002_rls.sql` | Row Level Security ポリシー |
| `0003_triggers.sql` | `updated_at` 自動更新 |

`auth.users` を実体ユーザーとして使うため、ユーザーテーブル本体は作成していません。匿名サインイン (`is_anonymous=true`) の利用者も `auth.uid()` で同じ RLS が効きます。

## 適用方法

### A. Supabase Dashboard から手で流す（最短）

1. [https://app.supabase.com](https://app.supabase.com) → 対象プロジェクト → **SQL Editor**
2. `0001_init.sql` の中身を貼り付けて Run
3. 続けて `0002_rls.sql` → `0003_triggers.sql` を順に Run
4. **Authentication → Providers → Anonymous** を有効化（必要なら Google/Magic Link も）

### B. Supabase CLI（推奨：履歴管理する場合）

```bash
# 初回のみ
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>

# 適用
supabase db push
```

CLI 利用時は `supabase/config.toml` を別途用意する必要があります（このリポジトリには未同梱）。

## 型の再生成

スキーマを変更したら、リポジトリの `types/db.ts` を CLI 出力で上書きする想定です：

```bash
supabase gen types typescript --project-id <your-project-ref> --schema public > types/db.ts
```

手書き版とフィールド名・型が一致するよう揃えてあります。

## .env

`.env.example` をコピーして `.env` を作成し、以下をセット：

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon public key>
NUXT_ANTHROPIC_API_KEY=<server-only>
```

`SUPABASE_KEY` は anon key（公開可）。service_role key はクライアントで絶対に使わないこと。
