-- 每日墨滴与经验奖励。使用前请先在目标 Supabase 项目执行本脚本。
-- 登录、阅读、收藏均按上海时区每天每种行为最多记一次；所有奖励在数据库端幂等结算。

-- 阅读历史原本只存在于前端及迁移草稿中。先确保线上存在可供阅读奖励验证的持久记录。
create table if not exists public.reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  progress_ratio numeric(5, 4) not null default 0,
  paragraph_index integer,
  position_label text,
  chapter_number integer,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, post_id),
  constraint reading_history_progress_check check (progress_ratio >= 0 and progress_ratio <= 1)
);

create index if not exists reading_history_user_last_read_idx
  on public.reading_history (user_id, last_read_at desc);

alter table public.reading_history enable row level security;
drop policy if exists reading_history_owner_all on public.reading_history;
create policy reading_history_owner_all
  on public.reading_history
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.reading_history from public, anon, authenticated;
grant select, insert, update, delete on public.reading_history to authenticated;

create table if not exists public.daily_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_date date not null,
  activity_type text not null check (activity_type in (
    'daily_login',
    'daily_read',
    'daily_bookmark',
    'legacy_activity_import'
  )),
  coin_delta bigint not null default 1 check (coin_delta >= 0),
  experience_delta bigint not null default 1 check (experience_delta >= 0),
  source_post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint daily_reward_ledger_unique_activity unique (user_id, reward_date, activity_type),
  constraint daily_reward_ledger_reward_amount_check check (
    (activity_type = 'legacy_activity_import' and coin_delta = 0)
    or (activity_type <> 'legacy_activity_import' and coin_delta = 1 and experience_delta = 1)
  )
);

create index if not exists daily_reward_ledger_user_date_idx
  on public.daily_reward_ledger (user_id, reward_date desc);

alter table public.daily_reward_ledger enable row level security;
drop policy if exists daily_reward_ledger_owner_select on public.daily_reward_ledger;
create policy daily_reward_ledger_owner_select
  on public.daily_reward_ledger
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists daily_reward_ledger_owner_login_insert on public.daily_reward_ledger;
create policy daily_reward_ledger_owner_login_insert
  on public.daily_reward_ledger
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and activity_type = 'daily_login'
    and reward_date = (pg_catalog.timezone('Asia/Shanghai', pg_catalog.clock_timestamp()))::date
    and coin_delta = 1
    and experience_delta = 1
    and source_post_id is null
  );
revoke all on public.daily_reward_ledger from public, anon, authenticated;
grant select, insert on public.daily_reward_ledger to authenticated;

-- 基于迁移前已存在的发布、阅读、收藏/关注日期与原页面的 2 点初始值，保留当前显示的历史经验。
-- 过去的登录没有数据库记录可供补发，墨滴也不对不可核实的历史行为追溯发放。
with published_days as (
  select
    p.user_id,
    count(distinct (pg_catalog.timezone('Asia/Shanghai', coalesce(p.published_at, p.created_at)))::date)::bigint as day_count
  from public.posts as p
  where p.status = 'published'
    and p.review_status is distinct from 'rejected'
  group by p.user_id
), reading_days as (
  select
    h.user_id,
    count(distinct (pg_catalog.timezone('Asia/Shanghai', h.last_read_at))::date)::bigint as day_count
  from public.reading_history as h
  group by h.user_id
), engagement_dates as (
  select f.follower_id as user_id, (pg_catalog.timezone('Asia/Shanghai', f.created_at))::date as activity_day
  from public.follows as f
  union
  select b.user_id, (pg_catalog.timezone('Asia/Shanghai', b.created_at))::date as activity_day
  from public.bookmarks as b
), engagement_days as (
  select user_id, count(distinct activity_day)::bigint as day_count
  from engagement_dates
  group by user_id
)
insert into public.daily_reward_ledger (
  user_id,
  reward_date,
  activity_type,
  coin_delta,
  experience_delta
)
select
  profile.id,
  date '1970-01-01',
  'legacy_activity_import',
  0,
  coalesce(published_days.day_count, 0) * 10
    + coalesce(reading_days.day_count, 0) * 2
    + coalesce(engagement_days.day_count, 0) * 2
    + 2
from public.profiles as profile
left join published_days on published_days.user_id = profile.id
left join reading_days on reading_days.user_id = profile.id
left join engagement_days on engagement_days.user_id = profile.id
where coalesce(published_days.day_count, 0) * 10
    + coalesce(reading_days.day_count, 0) * 2
    + coalesce(engagement_days.day_count, 0) * 2
    + 2 > 0
on conflict (user_id, reward_date, activity_type) do nothing;

create schema if not exists rewards_private;
revoke all on schema rewards_private from public, anon, authenticated;

create or replace function rewards_private.award_daily_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reward_type text;
begin
  if tg_table_name = 'bookmarks' then
    reward_type := 'daily_bookmark';
  elsif tg_table_name = 'reading_history' then
    reward_type := 'daily_read';
  else
    return new;
  end if;

  insert into public.daily_reward_ledger (
    user_id,
    reward_date,
    activity_type,
    coin_delta,
    experience_delta,
    source_post_id
  )
  values (
    new.user_id,
    (pg_catalog.timezone('Asia/Shanghai', pg_catalog.clock_timestamp()))::date,
    reward_type,
    1,
    1,
    new.post_id
  )
  on conflict (user_id, reward_date, activity_type) do nothing;

  return new;
end;
$$;

revoke all on function rewards_private.award_daily_activity() from public, anon, authenticated;

drop trigger if exists bookmarks_daily_reward on public.bookmarks;
create trigger bookmarks_daily_reward
  after insert on public.bookmarks
  for each row
  execute function rewards_private.award_daily_activity();

drop trigger if exists reading_history_daily_reward_insert on public.reading_history;
create trigger reading_history_daily_reward_insert
  after insert on public.reading_history
  for each row
  execute function rewards_private.award_daily_activity();

drop trigger if exists reading_history_daily_reward_update on public.reading_history;
create trigger reading_history_daily_reward_update
  after update of last_read_at on public.reading_history
  for each row
  execute function rewards_private.award_daily_activity();

create or replace function public.claim_daily_login_reward()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.daily_reward_ledger (
    user_id,
    reward_date,
    activity_type,
    coin_delta,
    experience_delta
  )
  values (
    current_user_id,
    (pg_catalog.timezone('Asia/Shanghai', pg_catalog.clock_timestamp()))::date,
    'daily_login',
    1,
    1
  )
  on conflict (user_id, reward_date, activity_type) do nothing;

  get diagnostics inserted_rows = row_count;
  return inserted_rows > 0;
end;
$$;

revoke all on function public.claim_daily_login_reward() from public, anon, authenticated;
grant execute on function public.claim_daily_login_reward() to authenticated;

create or replace function public.get_my_reward_summary()
returns table (coin_balance bigint, experience_points bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(ledger.coin_delta), 0)::bigint,
    coalesce(sum(ledger.experience_delta), 0)::bigint
  from public.daily_reward_ledger as ledger
  where ledger.user_id = (select auth.uid());
$$;

revoke all on function public.get_my_reward_summary() from public, anon, authenticated;
grant execute on function public.get_my_reward_summary() to authenticated;
