-- =====================================================================
-- BookHub — Volumes schema addition
-- Run in the Supabase SQL Editor.
-- =====================================================================
create table if not exists public.volumes (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title       text not null,
  summary     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.chapters add column if not exists volume_id uuid references public.volumes(id) on delete set null;
alter table public.volumes enable row level security;
drop policy if exists "own rows" on public.volumes;
create policy "own rows" on public.volumes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.volumes to authenticated;
create index if not exists idx_volumes_book on public.volumes(book_id);
create index if not exists idx_chapters_volume on public.chapters(volume_id);
drop trigger if exists bh_volumes_updated_at on public.volumes;
create trigger bh_volumes_updated_at before update on public.volumes for each row execute function bh_set_updated_at();
