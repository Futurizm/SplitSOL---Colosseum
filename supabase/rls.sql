-- ═══════════════════════════════════════════════════════════════════════════
-- SplitSOL — Row Level Security
--
-- Выполнять ПОСЛЕ supabase/schema.sql.
--
-- Принцип: пользователь видит только те группы, в которых он сам участник
-- (или которые он создал). Суммы и кошельки других людей не должны утекать.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.transactions   enable row level security;
alter table public.activity_feed  enable row level security;

-- Service role обходит RLS — поэтому все записи с бэкенда идут через него.
-- Ниже политики только для роли `authenticated`.

-- ─── Вспомогательная функция: состою ли я в группе ─────────────────────────
create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = target_group
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(target_group uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    where g.id = target_group and g.created_by = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- profiles
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "profiles are viewable by authenticated" on public.profiles;
create policy "profiles are viewable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- groups
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "members can view their groups" on public.groups;
create policy "members can view their groups"
  on public.groups for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_group_member(id)
    -- Присоединяющимся по invite-коду нужен доступ к названию и сумме группы
    or exists (
      select 1 from public.group_members m
      where m.group_id = groups.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "authenticated users create groups" on public.groups;
create policy "authenticated users create groups"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "owners update groups" on public.groups;
create policy "owners update groups"
  on public.groups for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "owners delete closed groups" on public.groups;
create policy "owners delete closed groups"
  on public.groups for delete
  to authenticated
  using (created_by = auth.uid() and status <> 'active');

-- ═══════════════════════════════════════════════════════════════════════════
-- group_members
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "members view group roster" on public.group_members;
create policy "members view group roster"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

-- Создатель задаёт состав группы сразу после её создания.
drop policy if exists "owners add members" on public.group_members;
create policy "owners add members"
  on public.group_members for insert
  to authenticated
  with check (
    public.is_group_owner(group_id)
    or user_id = auth.uid()          -- присоединение по invite-коду
  );

-- Статус оплаты обновляет service role (после верификации транзакции)
-- либо сам участник — но только свою строку и только с 'pending' на 'paid'.
drop policy if exists "members update own membership" on public.group_members;
create policy "members update own membership"
  on public.group_members for update
  to authenticated
  using (user_id = auth.uid() or public.is_group_owner(group_id))
  with check (user_id = auth.uid() or public.is_group_owner(group_id));

drop policy if exists "members leave group" on public.group_members;
create policy "members leave group"
  on public.group_members for delete
  to authenticated
  using (public.is_group_owner(group_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- transactions
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "members view group transactions" on public.transactions;
create policy "members view group transactions"
  on public.transactions for select
  to authenticated
  using (public.is_group_member(group_id));

-- Записи создаёт только service role: клиент не может «нарисовать» платёж.
drop policy if exists "owners manage transactions" on public.transactions;
create policy "owners manage transactions"
  on public.transactions for all
  to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- activity_feed
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "members view activity" on public.activity_feed;
create policy "members view activity"
  on public.activity_feed for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "members write activity" on public.activity_feed;
create policy "members write activity"
  on public.activity_feed for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
