-- =====================================================
-- 0008_x_post_hashtags.sql
-- user_profile に X 公開投稿用ハッシュタグ配列を追加。
--   - jsonb の文字列配列。各要素は # を含まないタグ名(例: ["コンカフェ", "推し活"])
--   - アプリ側で末尾に付与する。プロンプトでは出力禁止にする。
--   - コンカフェ業種の既存ユーザーは ["コンカフェ"] をデフォルトとして埋める。
-- =====================================================

alter table public.user_profile
  add column if not exists x_post_hashtags jsonb not null default '[]'::jsonb;

update public.user_profile
   set x_post_hashtags = '["コンカフェ"]'::jsonb
 where industry = 'concafe'
   and (x_post_hashtags is null or x_post_hashtags = '[]'::jsonb);
