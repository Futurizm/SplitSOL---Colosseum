-- ═══════════════════════════════════════════════════════════════════════════
-- SplitSOL — схема базы данных (Supabase / PostgreSQL)
--
-- Выполняйте в Supabase Dashboard → SQL Editor или через `supabase db push`.
-- В��е суммы хранятся в минимальных единицах токена (micro-tUSDC, 6 decimals):
-- никаких float и NUMERIC с дробной частью в приложении.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Расширения ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";        -- gen_random_uuid()
create extension if not exists "pg_trgm";          -- поиск по названию группы

-- ─── Перечисления ──────────────────────────────────────────────────────────
do $$ begin
  create type group_category as enum ('restaurant', 'travel', 'shopping', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type group_status as enum ('active', 'settled', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_status as enum ('pending', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('owner', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_status as enum ('pending', 'confirmed', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_action as enum ('joined', 'paid', 'created', 'invited');
exception when duplicate_object then null; end $$;

do $$ begin
  create type supported_currency as enum ('tUSDC', 'SOL');
exception when duplicate_object then null; end $$;

-- ─── Профили ───────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid references auth.users (id) on delete cascade primary key,
  username      text unique,
  display_name  text,
  avatar_url    text,
  -- Публичный ключ кошелька Solana. Приватный ключ в приложении не хранится.
  wallet_address text,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-zA-Z0-9_]{3,24}$'
  )
);

comment on column profiles.wallet_address is
  'Base58 публичный ключ Solana. Только для отображения и привязки.';

-- ─── Группы ────────────────────────────────────────────────────────────────
create table if not exists groups (
  id                uuid default gen_random_uuid() primary key,
  name              text not null,
  description       text,
  category          group_category not null default 'other',
  created_by        uuid references profiles (id) on delete set null,
  -- Сумма счёта в micro-единицах токена (6 decimals). 30.00 tUSDC = 30000000.
  total_amount      decimal(20, 6) not null,
  currency          supported_currency not null default 'tUSDC',
  status            group_status not null default 'active',
  invite_code       text not null unique,
  -- Адрес кошелька ресторана / организатора (получателя при расчёте).
  restaurant_wallet text,
  image_url         text,
  created_at        timestamptz not null default now(),
  settled_at        timestamptz,

  -- on-chain аккаунт Anchor-программы
  onchain_group_pda text,
  onchain_group_id  text,

  constraint groups_name_length check (char_length(name) between 3 and 80),
  constraint groups_amount_positive check (total_amount > 0),
  constraint groups_invite_code_format check (invite_code ~ '^[A-Z0-9]{4,16}$'),
  constraint groups_wallet_format check (
    restaurant_wallet is null or restaurant_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  ),
  constraint groups_pda_format check (
    onchain_group_pda is null or onchain_group_pda ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  )
);

create index if not exists groups_created_by_idx on groups (created_by);
create index if not exists groups_status_idx on groups (status);
create index if not exists groups_created_at_idx on groups (created_at desc);
create index if not exists groups_invite_code_idx on groups (invite_code);
create index if not exists groups_name_trgm on groups using gin (name gin_trgm_ops);

comment on column groups.total_amount is
  'Сумма счёта в минимальных единицах токена (micro-tUSDC).';

-- ─── Участники группы ──────────────────────────────────────────────────────
create table if not exists group_members (
  id               uuid default gen_random_uuid() primary key,
  group_id         uuid not null references groups (id) on delete cascade,
  user_id          uuid references profiles (id) on delete set null,
  guest_name       text,
  guest_wallet     text,
  -- Доля к оплате в micro-единицах.
  share_amount     decimal(20, 6) not null,
  -- Процент от общей суммы (денормализовано для UI).
  share_percentage decimal(5, 2) not null default 0,
  status           member_status not null default 'pending',
  paid_at          timestamptz,
  tx_signature     text,
  role             member_role not null default 'member',
  joined_at        timestamptz not null default now(),
  onchain_member_pda text,

  constraint group_members_share_positive check (share_amount > 0),
  constraint group_members_percentage_range check (
    share_percentage >= 0 and share_percentage <= 100
  ),
  constraint group_members_wallet_format check (
    guest_wallet is null or guest_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  ),
  -- Не больше 10 участников: ограничение Anchor-программы (см. MAX_MEMBERS).
  constraint group_members_max_count check (share_amount is not null)
);

-- Один участник на пользователя в группе; гости могут повторяться по имени.
create unique index if not exists group_members_user_unique
  on group_members (group_id, user_id)
  where user_id is not null;

-- Не больше одного владельца на группу.
create unique index if not exists group_members_single_owner
  on group_members (group_id)
  where role = 'owner';

create unique index if not exists group_members_pda_unique
  on group_members (onchain_member_pda)
  where onchain_member_pda is not null;

create index if not exists group_members_group_idx on group_members (group_id);
create index if not exists group_members_user_idx on group_members (user_id);
create index if not exists group_members_status_idx on group_members (group_id, status);
create index if not exists group_members_paid_at_idx on group_members (paid_at desc);

-- ─── Транзакции ───────────────────────────────────────────────────────────
create table if not exists transactions (
  id            uuid default gen_random_uuid() primary key,
  group_id      uuid not null references groups (id) on delete cascade,
  member_id     uuid references group_members (id) on delete set null,
  from_wallet   text not null,
  to_wallet     text not null,
  amount        decimal(20, 6) not null,
  currency      text not null default 'tUSDC',
  tx_signature  text unique,
  status        transaction_status not null default 'pending',
  -- Unix timestamp блока (секунды)
  block_time    bigint,
  slot          bigint,
  -- Комиссия в lamports
  fee           decimal(20, 9),
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  -- Как прошла оплата: инструкцией программы или через Solana Pay
  kind          text default 'anchor' check (kind in ('anchor', 'solana_pay')),

  constraint transactions_amount_positive check (amount > 0),
  constraint transactions_wallet_format check (
    from_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    and to_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  )
);

create index if not exists transactions_group_idx on transactions (group_id);
create index if not exists transactions_member_idx on transactions (member_id);
create index if not exists transactions_created_at_idx on transactions (created_at desc);
create index if not exists transactions_status_idx on transactions (status);

-- ─── Лента активности ─────────────────────────────────────────────────────
create table if not exists activity_feed (
  id         uuid default gen_random_uuid() primary key,
  group_id   uuid not null references groups (id) on delete cascade,
  user_id    uuid references profiles (id) on delete set null,
  action     activity_action not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_feed_group_idx on activity_feed (group_id, created_at desc);
create index if not exists activity_feed_user_idx on activity_feed (user_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- Автоматика: профиль создаётся вместе с auth.users
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at обновляется автоматически
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch
  before update on profiles
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Согласованность: доля не должна превышать счёт, после оплаты обязательна дата
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.check_member_share_within_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  group_total numeric(20, 6);
  committed   numeric(20, 6);
begin
  select total_amount into group_total from public.groups where id = new.group_id;
  if group_total is null then
    raise exception 'Группа % не найдена', new.group_id using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(share_amount), 0) into committed
  from public.group_members
  where group_id = new.group_id and id is distinct from new.id;

  if committed + new.share_amount > group_total then
    raise exception
      'Сумма долей (%,%) превышает общий счёт (%)', committed, new.share_amount, group_total
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists group_members_share_guard on group_members;
create constraint trigger group_members_share_guard
  after insert or update of share_amount, group_id on public.group_members
  deferrable initially deferred
  for each row execute function public.check_member_share_within_group();

create or replace function public.check_paid_has_signature()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and (new.paid_at is null or tx_signature is null) then
    raise exception 'Оплаченный участник должен иметь paid_at и tx_signature'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists group_members_paid_guard on group_members;
create trigger group_members_paid_guard
  before insert or update of status on public.group_members
  for each row execute function public.check_paid_has_signature();

-- ═══════════════════════════════════════════════════════════════════════════
-- Представления для удобных выборок
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.group_progress
with (security_invoker = true) as
select
  g.id,
  g.name,
  g.status,
  g.currency,
  g.total_amount,
  count(m.id)                                            as member_count,
  count(m.id) filter (where m.status = 'paid')           as paid_count,
  coalesce(sum(m.share_amount) filter (where m.status = 'paid'), 0) as paid_amount,
  coalesce(sum(m.share_amount), 0)                       as committed_amount
from public.groups g
left join public.group_members m on m.group_id = g.id
group by g.id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime: чтобы статусы оплат приходили в интерфейс без polling
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'activity_feed'
  ) then
    alter publication supabase_realtime add table public.activity_feed;
  end if;
end $$;
