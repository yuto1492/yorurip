-- =====================================================
-- 0006_extend_customer_types.sql
-- customer_type に以下を追加:
--   other_oshi  : 他キャスト推し(自分は二番手以下)
--   kake_mochi  : 掛け持ち(複数キャストを推している)
--   peer_cast   : 同業キャスト(客ではなく同業者として来店)
-- =====================================================

alter table public.customers
  drop constraint if exists customers_customer_type_check;

alter table public.customers
  add constraint customers_customer_type_check
  check (
    customer_type is null
    or customer_type in (
      'futo',
      'ita',
      'mame',
      'shio',
      'oshi_gachi',
      'oshi_enjoy',
      'other_oshi',
      'kake_mochi',
      'peer_cast'
    )
  );
