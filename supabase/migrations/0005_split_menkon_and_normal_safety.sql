-- =====================================================
-- 0005_split_menkon_and_normal_safety.sql
--
-- 1. 業種に menkon (メンズコンセプトカフェ) を追加
--    concafe は引き続き「女性向けコンセプトカフェ・メイドカフェ等」を指す
-- 2. 安全モードに normal を追加し、デフォルトを safe → normal に変更
--    既存ユーザーの safety_mode は変えない(safeの人はsafeのまま)
-- =====================================================

-- ----- industry ------------------------------------------
alter table public.user_profile
  drop constraint if exists user_profile_industry_check;

alter table public.user_profile
  add constraint user_profile_industry_check
  check (industry in (
    'concafe',
    'menkon',
    'kyaba',
    'host',
    'fuzoku',
    'bar_female',
    'bar_male',
    'other'
  ));

-- ----- safety_mode ---------------------------------------
alter table public.user_profile
  drop constraint if exists user_profile_safety_mode_check;

alter table public.user_profile
  add constraint user_profile_safety_mode_check
  check (safety_mode in ('safe', 'normal', 'loose'));

-- 新規プロファイル作成時のデフォルトを normal に
-- (既存のレコードには影響しない)
alter table public.user_profile
  alter column safety_mode set default 'normal';
