-- =====================================================
-- 0009_merge_call_name_into_nickname.sql
--
-- customers.call_name と nickname を nickname 1本に統合する。
--   - call_name が埋まっていればそちらを「より親しい呼びかけ」と判断して
--     nickname を上書き
--   - 元の nickname は捨てる(Twitter handle 等の識別子は失われるが、
--     アプリのコンセプト的には呼びかけ名のほうが価値が高い)
--   - 最後に call_name カラムを drop
-- =====================================================

update public.customers
   set nickname = trim(call_name)
 where call_name is not null
   and trim(call_name) <> ''
   and trim(call_name) <> trim(nickname);

alter table public.customers
  drop column if exists call_name;
