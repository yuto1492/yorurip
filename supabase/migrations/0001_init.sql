-- =====================================================
-- 0001_init.sql
-- ヨルリプ 初期スキーマ
--
-- 注意:
--   - ユーザー実体は Supabase の auth.users をそのまま使う
--   - is_anonymous は auth.users に標準で存在 (匿名サインイン)
--   - 全公開テーブルに user_id を持たせ、RLS を auth.uid() で完結させる
--     (visit_logs / conversation_memos も customer_id 経由 join せず直接 RLS)
--
-- リテラル一覧:
--   industry      : concafe / kyaba / host / fuzoku / other
--   safety_mode   : safe / loose
--   channel       : line / x_dm / ig_dm / x_post
--   customer_type : futo / ita / mame / shio / oshi_gachi / oshi_enjoy
--   mode          : general / personal / reply / thanks / public_post
--   tone_source   : auto_edited / manual
--   memo_source   : manual / tool_use_approved
-- =====================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------
-- user_profile
-- -----------------------------------------------------
create table public.user_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  industry text not null check (industry in ('concafe', 'kyaba', 'host', 'fuzoku', 'other')),
  genji_name text,
  safety_mode text not null default 'safe' check (safety_mode in ('safe', 'loose')),
  tone_features jsonb not null default '{}'::jsonb,
  ng_words jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------
-- tone_samples
-- 編集後コピーされた文面 / 手動追加された文面
-- channel ごとに分けて学習する (LINE と X DM では文体が違うため)
-- -----------------------------------------------------
create table public.tone_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('line', 'x_dm', 'ig_dm', 'x_post')),
  content text not null,
  source text not null check (source in ('auto_edited', 'manual')),
  created_at timestamptz not null default now()
);
create index tone_samples_user_id_channel_created_at_idx
  on public.tone_samples (user_id, channel, created_at desc);

-- -----------------------------------------------------
-- customers (カルテ)
-- customer_type:
--   futo (太客) / ita (痛客) / mame (マメ客) / shio (塩客)
--   oshi_gachi (推しガチ勢) / oshi_enjoy (推しエンジョイ勢)  ← コンカフェ用
-- -----------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  call_name text,
  age int check (age between 0 and 120),
  occupation text,
  preferences jsonb not null default '{}'::jsonb,
  customer_type text check (
    customer_type in ('futo', 'ita', 'mame', 'shio', 'oshi_gachi', 'oshi_enjoy')
  ),
  relation_score int check (relation_score between 1 and 5),
  ng_time text,
  last_visit_at timestamptz,
  -- コンカフェ拡張
  cheki_count int not null default 0 check (cheki_count >= 0),
  goods_owned jsonb not null default '[]'::jsonb,
  oshi_rank text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_user_id_idx on public.customers (user_id);
create index customers_user_id_last_visit_idx
  on public.customers (user_id, last_visit_at desc nulls last);

-- -----------------------------------------------------
-- visit_logs
-- gifts_received: コンカフェのプレゼント等を JSON 配列で
-- -----------------------------------------------------
create table public.visit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  visit_date date not null,
  amount int check (amount >= 0),
  is_dohan boolean not null default false,
  is_after boolean not null default false,
  cheki_taken int not null default 0 check (cheki_taken >= 0),
  gifts_received jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index visit_logs_customer_id_visit_date_idx
  on public.visit_logs (customer_id, visit_date desc);
create index visit_logs_user_id_idx on public.visit_logs (user_id);

-- -----------------------------------------------------
-- conversation_memos
-- source = manual | tool_use_approved (Tool Use 経由で承認カード経由で保存)
-- -----------------------------------------------------
create table public.conversation_memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  memo_date date not null default current_date,
  content text not null,
  source text not null check (source in ('manual', 'tool_use_approved')),
  created_at timestamptz not null default now()
);
create index conversation_memos_customer_id_memo_date_idx
  on public.conversation_memos (customer_id, memo_date desc);
create index conversation_memos_user_id_idx on public.conversation_memos (user_id);

-- -----------------------------------------------------
-- generation_history
-- mode: general / personal / reply / thanks / public_post
-- channel: line / x_dm / ig_dm / x_post
-- output_candidates: 3案 を JSON 配列で
-- -----------------------------------------------------
create table public.generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  mode text not null check (mode in ('general', 'personal', 'reply', 'thanks', 'public_post')),
  channel text not null check (channel in ('line', 'x_dm', 'ig_dm', 'x_post')),
  input_context jsonb not null default '{}'::jsonb,
  output_candidates jsonb not null default '[]'::jsonb,
  final_copied text,
  created_at timestamptz not null default now()
);
create index generation_history_user_id_created_at_idx
  on public.generation_history (user_id, created_at desc);
create index generation_history_customer_id_idx
  on public.generation_history (customer_id);
