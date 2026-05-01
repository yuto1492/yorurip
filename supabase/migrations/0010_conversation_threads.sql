-- =====================================================
-- 0010_conversation_threads.sql
--
-- 「客と会話」機能のためのスレッド+メッセージテーブルを追加。
-- 単発返信(/generate?mode=reply)と並列で、客と継続的なやり取りを
-- 履歴として残しながら AI 返信生成できる。
--
-- 設計:
--   - thread は customer_id 必須(Q1: 未登録客では始めない)
--   - thread に「生成設定のデフォルト」を持たせる(Q4: per-thread 永続化)
--   - メッセージは direction(incoming/outgoing) で双方向、source で manual/AI 区別
--   - 再生成時の不採用候補は保存しない(Q2)
-- =====================================================

create extension if not exists "pgcrypto";

-- ----- threads ------------------------------------------------
create table public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text,
  last_message_at timestamptz,

  -- スレッド固有の生成設定 (Q4)
  default_length text not null
    check (default_length in ('short', 'medium', 'long'))
    default 'medium',
  default_affection int not null
    check (default_affection between 1 and 10)
    default 5,
  default_reply_flow text not null
    check (default_reply_flow in ('continue', 'cut'))
    default 'continue',
  default_extra_instructions text,

  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversation_threads_user_idx
  on public.conversation_threads (user_id, last_message_at desc nulls last);
create index conversation_threads_customer_idx
  on public.conversation_threads (customer_id);

-- ----- messages -----------------------------------------------
create table public.conversation_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),
  content text not null,
  source text not null
    check (source in ('manual', 'ai_generated', 'ai_regenerated'))
    default 'manual',
  created_at timestamptz not null default now()
);
create index conversation_thread_messages_thread_idx
  on public.conversation_thread_messages (thread_id, created_at);
create index conversation_thread_messages_user_idx
  on public.conversation_thread_messages (user_id);

-- ----- RLS -----------------------------------------------------
alter table public.conversation_threads enable row level security;
alter table public.conversation_thread_messages enable row level security;

create policy "conversation_threads_owner_select"
  on public.conversation_threads for select
  using (auth.uid() = user_id);
create policy "conversation_threads_owner_insert"
  on public.conversation_threads for insert
  with check (auth.uid() = user_id);
create policy "conversation_threads_owner_update"
  on public.conversation_threads for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversation_threads_owner_delete"
  on public.conversation_threads for delete
  using (auth.uid() = user_id);

create policy "conversation_thread_messages_owner_select"
  on public.conversation_thread_messages for select
  using (auth.uid() = user_id);
create policy "conversation_thread_messages_owner_insert"
  on public.conversation_thread_messages for insert
  with check (auth.uid() = user_id);
create policy "conversation_thread_messages_owner_update"
  on public.conversation_thread_messages for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversation_thread_messages_owner_delete"
  on public.conversation_thread_messages for delete
  using (auth.uid() = user_id);

-- ----- updated_at trigger (threads only) ---------------------
create trigger conversation_threads_set_updated_at
  before update on public.conversation_threads
  for each row execute function public.set_updated_at();
