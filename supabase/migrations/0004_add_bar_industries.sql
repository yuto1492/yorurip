-- =====================================================
-- 0004_add_bar_industries.sql
-- 業種に bar_female / bar_male を追加
--   bar_female: バー(女)  -- ガールズバー含む
--   bar_male  : バー(男)  -- オーセンティック含む
-- CHECK制約を作り直す。
-- =====================================================

alter table public.user_profile
  drop constraint if exists user_profile_industry_check;

alter table public.user_profile
  add constraint user_profile_industry_check
  check (industry in (
    'concafe',
    'kyaba',
    'host',
    'fuzoku',
    'bar_female',
    'bar_male',
    'other'
  ));
