-- ═══════════════════════════════════════════════════════════════════════════
-- SplitSOL — демонстрационные данные (опционально)
--
-- ВНИМАНИЕ: строки со ссылкой на auth.users работают только если
-- соответствующие пользователи уже зарегистрированы через приложение.
-- Скрипт подставляет их по email; если пользователя нет — строка пропускается.
--
--   psql "$DATABASE_URL" -f supabase/seed.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Демо-профили ──────────────────────────────────────────────────────────
-- Сначала регистрируйтесь через /register, потом запускайте скрипт.

insert into public.profiles (id, username, display_name, wallet_address)
select
  u.id,
  'demo_' || substr(md5(u.id::text), 1, 6),
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)),
  null
from auth.users u
on conflict (id) do update
  set updated_at = now();

-- ─── Группы ────────────────────────────────────────────────────────────────
-- Суммы указаны в micro-единицах: 30.00 tUSDC = 30 000 000.
insert into public.groups (
  id, name, description, category, total_amount, currency,
  status, invite_code, restaurant_wallet, created_by
)
select
  gen_random_uuid(),
  'Ужин в Astana',
  'Счёт за ужин, делим поровну на четверых',
  'restaurant',
  30000000,
  'tUSDC',
  'active',
  'DEMO0001',
  '11111111111111111111111111111112',
  (select id from public.profiles order by created_at limit 1)
where exists (select 1 from public.profiles)
on conflict (invite_code) do nothing;

insert into public.groups (
  id, name, description, category, total_amount, currency,
  status, invite_code, restaurant_wallet, created_by
)
select
  gen_random_uuid(),
  'Поездка в Алматы',
  'Билеты и ночёвка',
  'travel',
  120000000,
  'tUSDC',
  'active',
  'DEMO0002',
  '11111111111111111111111111111112',
  (select id from public.profiles order by created_at limit 1)
where exists (select 1 from public.profiles)
on conflict (invite_code) do nothing;

insert into public.groups (
  id, name, description, category, total_amount, currency,
  status, invite_code, restaurant_wallet, created_by, settled_at
)
select
  gen_random_uuid(),
  'Покупки в магазине',
  'Рассчитанная группа — пример завершённого счёта',
  'shopping',
  4550000,
  'tUSDC',
  'settled',
  'DEMO0003',
  '11111111111111111111111111111112',
  (select id from public.profiles order by created_at limit 1),
  now()
where exists (select 1 from public.profiles)
on conflict (invite_code) do nothing;

-- ─── Участники ─────────────────────────────────────────────────────────────
-- Доли в micro-единицах; проценты согласованы с суммами.
insert into public.group_members (
  group_id, user_id, guest_name, guest_wallet,
  share_amount, share_percentage, status, role
)
select
  g.id,
  p.id,
  p.display_name,
  null,
  7500000,
  25.00,
  'paid',
  'owner'
from public.groups g, public.profiles p
where g.invite_code = 'DEMO0001' and p.id = (select id from public.profiles order by created_at limit 1)
on conflict do nothing;

insert into public.group_members (
  group_id, user_id, guest_name, guest_wallet,
  share_amount, share_percentage, status, role
)
select
  g.id,
  null,
  'Айдана',
  null,
  7500000,
  25.00,
  'paid',
  'member'
from public.groups g
where g.invite_code = 'DEMO0001'
on conflict do nothing;

insert into public.group_members (
  group_id, user_id, guest_name, guest_wallet,
  share_amount, share_percentage, status, role
)
select
  g.id,
  null,
  'Данияр',
  null,
  7500000,
  25.00,
  'pending',
  'member'
from public.groups g
where g.invite_code = 'DEMO0001'
on conflict do nothing;

insert into public.group_members (
  group_id, user_id, guest_name, guest_wallet,
  share_amount, share_percentage, status, role
)
select
  g.id,
  null,
  'Тимур',
  null,
  7500000,
  25.00,
  'pending',
  'member'
from public.groups g
where g.invite_code = 'DEMO0001'
on conflict do nothing;

-- ─── Транзакции и активность ───────────────────────────────────────────────
-- Без реальных подписей: они появятся автоматически после реальных платежей.
insert into public.activity_feed (group_id, user_id, action, metadata)
select g.id, p.id, 'created', jsonb_build_object('name', g.name)
from public.groups g, public.profiles p
where g.invite_code = 'DEMO0001'
  and p.id = (select id from public.profiles order by created_at limit 1)
on conflict do nothing;

-- ─── Сводка ────────────────────────────────────────────────────────────────
select
  (select count(*) from public.profiles)      as profiles,
  (select count(*) from public.groups)        as groups,
  (select count(*) from public.group_members) as members;
