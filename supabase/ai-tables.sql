-- =====================================================================
-- BookHub — AI tables (run in Supabase SQL Editor)
-- =====================================================================

-- AI settings (per-book: constitution, fingerprint, router)
create table if not exists public.ai_settings (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  constitution  jsonb not null default '[]'::jsonb,
  fingerprint   jsonb not null default '{}'::jsonb,
  router        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- AI usage log (per-call: provider, model, task, tokens)
create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  provider      text not null,
  model         text not null,
  task          text not null,
  tokens        int not null default 0,
  created_at    timestamptz not null default now()
);

-- AI cut log (discarded/edited AI proposals)
create table if not exists public.ai_cut_log (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  source        text not null default 'ai_proposal',
  kind          text not null default 'discarded',
  before_text   text,
  after_text    text,
  created_at    timestamptz not null default now()
);

-- RLS
alter table public.ai_settings enable row level security;
drop policy if exists "own rows" on public.ai_settings;
create policy "own rows" on public.ai_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.ai_usage enable row level security;
drop policy if exists "own rows" on public.ai_usage;
create policy "own rows" on public.ai_usage for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.ai_cut_log enable row level security;
drop policy if exists "own rows" on public.ai_cut_log;
create policy "own rows" on public.ai_cut_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grants
grant select, insert, update, delete on public.ai_settings to authenticated;
grant select, insert, update, delete on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_cut_log to authenticated;

-- Indexes
create index if not exists idx_ai_settings_book on public.ai_settings(book_id);
create index if not exists idx_ai_usage_book on public.ai_usage(book_id, created_at desc);
create index if not exists idx_ai_cut_log_book on public.ai_cut_log(book_id, created_at desc);

-- Triggers
drop trigger if exists bh_ai_settings_updated_at on public.ai_settings;
create trigger bh_ai_settings_updated_at before update on public.ai_settings
  for each row execute function bh_set_updated_at();
