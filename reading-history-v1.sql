-- 阅读历史：每个用户对每篇作品保留最近一次阅读位置。
-- 执行前请确认当前项目的 Supabase 数据库环境。
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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
