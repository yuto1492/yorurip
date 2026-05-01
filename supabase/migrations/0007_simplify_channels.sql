-- =====================================================
-- 0007_simplify_channels.sql
--
-- channel を「媒体」から「文体スタイル」に再定義し、3バケットに簡素化:
--   旧: line / x_dm / ig_dm / x_post  (媒体ベース)
--   新: dm / x_post / thanks          (文体スタイルベース)
--
-- LINE/X DM/Instagram DM は文体的に類似しているため dm に統合。
-- お礼/感謝文は他のメッセージとトーンが顕著に異なるので thanks として独立。
--
-- 影響テーブル: tone_samples / generation_history
-- user_profile.tone_features (jsonb) は古い byChannel.line などの
-- キーが残るが、無視されるだけで害はない(再分析で上書きされる)。
-- =====================================================

-- 1. 既存データを新値にマッピング
update public.tone_samples
   set channel = 'dm'
 where channel in ('line', 'x_dm', 'ig_dm');

update public.generation_history
   set channel = 'dm'
 where channel in ('line', 'x_dm', 'ig_dm');

-- 2. CHECK 制約を作り直す
alter table public.tone_samples
  drop constraint if exists tone_samples_channel_check;

alter table public.tone_samples
  add constraint tone_samples_channel_check
  check (channel in ('dm', 'x_post', 'thanks'));

alter table public.generation_history
  drop constraint if exists generation_history_channel_check;

alter table public.generation_history
  add constraint generation_history_channel_check
  check (channel in ('dm', 'x_post', 'thanks'));
