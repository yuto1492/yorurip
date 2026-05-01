-- =====================================================
-- 0002_rls.sql
-- 全テーブルで RLS を有効化し、所有者(auth.uid() = user_id)のみ操作可能とする。
-- 匿名サインイン (is_anonymous=true) のユーザーも auth.uid() で同等に扱える。
-- =====================================================

alter table public.user_profile        enable row level security;
alter table public.tone_samples        enable row level security;
alter table public.customers           enable row level security;
alter table public.visit_logs          enable row level security;
alter table public.conversation_memos  enable row level security;
alter table public.generation_history  enable row level security;

-- --- user_profile -------------------------------------
create policy "user_profile_owner_select" on public.user_profile
  for select using (auth.uid() = user_id);
create policy "user_profile_owner_insert" on public.user_profile
  for insert with check (auth.uid() = user_id);
create policy "user_profile_owner_update" on public.user_profile
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_profile_owner_delete" on public.user_profile
  for delete using (auth.uid() = user_id);

-- --- tone_samples -------------------------------------
create policy "tone_samples_owner_select" on public.tone_samples
  for select using (auth.uid() = user_id);
create policy "tone_samples_owner_insert" on public.tone_samples
  for insert with check (auth.uid() = user_id);
create policy "tone_samples_owner_update" on public.tone_samples
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tone_samples_owner_delete" on public.tone_samples
  for delete using (auth.uid() = user_id);

-- --- customers ----------------------------------------
create policy "customers_owner_select" on public.customers
  for select using (auth.uid() = user_id);
create policy "customers_owner_insert" on public.customers
  for insert with check (auth.uid() = user_id);
create policy "customers_owner_update" on public.customers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "customers_owner_delete" on public.customers
  for delete using (auth.uid() = user_id);

-- --- visit_logs ---------------------------------------
create policy "visit_logs_owner_select" on public.visit_logs
  for select using (auth.uid() = user_id);
create policy "visit_logs_owner_insert" on public.visit_logs
  for insert with check (auth.uid() = user_id);
create policy "visit_logs_owner_update" on public.visit_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "visit_logs_owner_delete" on public.visit_logs
  for delete using (auth.uid() = user_id);

-- --- conversation_memos -------------------------------
create policy "conversation_memos_owner_select" on public.conversation_memos
  for select using (auth.uid() = user_id);
create policy "conversation_memos_owner_insert" on public.conversation_memos
  for insert with check (auth.uid() = user_id);
create policy "conversation_memos_owner_update" on public.conversation_memos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversation_memos_owner_delete" on public.conversation_memos
  for delete using (auth.uid() = user_id);

-- --- generation_history -------------------------------
-- 履歴は基本 read-only な扱い。物理削除はユーザー要求時 (退会等) のみ
create policy "generation_history_owner_select" on public.generation_history
  for select using (auth.uid() = user_id);
create policy "generation_history_owner_insert" on public.generation_history
  for insert with check (auth.uid() = user_id);
create policy "generation_history_owner_update" on public.generation_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "generation_history_owner_delete" on public.generation_history
  for delete using (auth.uid() = user_id);
