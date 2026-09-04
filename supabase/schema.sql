-- =====================================================================
-- BookHub — Schema (Part A)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It creates all tables, indexes, RLS policies, and triggers.
-- Idempotent: safe to re-run (drops + recreates). Drops cascade.
-- =====================================================================

-- Extensions ----------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- =====================================================================
-- Helpers
-- =====================================================================

-- auto-update updated_at on row change
create or replace function bh_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- mirror auth.users → public.users on signup
create or replace function bh_mirror_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, created_at)
  values (new.id, new.email, coalesce(new.created_at, now()))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- public.users — mirror of auth.users (one row per account)
-- =====================================================================
create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

drop trigger if exists bh_users_updated_at on public.users;
create trigger bh_users_updated_at before update on public.users
  for each row execute function bh_set_updated_at();

-- mirror trigger: new auth user → public.users row
drop trigger if exists bh_on_auth_user_created on auth.users;
create trigger bh_on_auth_user_created
  after insert on auth.users
  for each row execute function bh_mirror_auth_user();

-- =====================================================================
-- books
-- =====================================================================
create table if not exists public.books (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  title               text not null,
  genre               text,
  blurb               text,
  visibility          text not null default 'private' check (visibility in ('public','private')),
  world_summary_title text,
  world_summary_body  text,
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists bh_books_updated_at on public.books;
create trigger bh_books_updated_at before update on public.books
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- branches
-- =====================================================================
create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists bh_branches_updated_at on public.branches;
create trigger bh_branches_updated_at before update on public.branches
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- chapters
-- =====================================================================
create table if not exists public.chapters (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  branch_id   uuid references public.branches(id) on delete set null,
  sort_order  int not null default 0,
  title       text not null,
  status      text not null default 'draft' check (status in ('draft','revision','done')),
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists bh_chapters_updated_at on public.chapters;
create trigger bh_chapters_updated_at before update on public.chapters
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- drafts (saved versions of a chapter; one is_main per chapter)
-- =====================================================================
create table if not exists public.drafts (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references public.chapters(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null default '',
  message     text not null default '',
  why         text,
  hash        text,
  is_main     boolean not null default false,
  word_count  int not null default 0,
  created_at  timestamptz not null default now()
);

-- at most one is_main draft per chapter
drop index if exists drafts_one_main;
create unique index drafts_one_main on public.drafts(chapter_id) where is_main;

-- =====================================================================
-- zones (canvas group regions)
-- =====================================================================
create table if not exists public.zones (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.books(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   text not null,
  label      text,
  tint       text,
  x          double precision not null default 0,
  y          double precision not null default 0,
  w          double precision not null default 200,
  h          double precision not null default 150,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bh_zones_updated_at on public.zones;
create trigger bh_zones_updated_at before update on public.zones
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- cards (lore cards + characters — same table, category distinguishes)
-- =====================================================================
create table if not exists public.cards (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.books(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  zone_id        uuid references public.zones(id) on delete set null,
  category       text not null check (category in
                   ('magic','cosmology','geography','factions','history','bestiary','character')),
  title          text not null,
  summary        text not null default '',
  body           text not null default '',
  canon_status   text not null default 'draft' check (canon_status in ('canon','draft','deprecated')),
  x              double precision not null default 0,
  y              double precision not null default 0,
  sort_order     int,                                   -- timeline order (history cards); null otherwise
  tags           text[] not null default '{}',
  fields         jsonb not null default '[]'::jsonb,    -- [{label,value}, ...]
  character_data jsonb,                                 -- characters only: {role,arc,voiceNotes,knows,firstAppears}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists bh_cards_updated_at on public.cards;
create trigger bh_cards_updated_at before update on public.cards
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- card_links (typed edges between cards)
-- =====================================================================
create table if not exists public.card_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  from_card_id uuid not null references public.cards(id) on delete cascade,
  to_card_id   uuid not null references public.cards(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- glossary_terms
-- =====================================================================
create table if not exists public.glossary_terms (
  id                  uuid primary key default gen_random_uuid(),
  book_id             uuid not null references public.books(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  term                text not null,
  definition          text not null default '',
  related_card_id     uuid references public.cards(id) on delete set null,
  first_use_chapter_id uuid references public.chapters(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists bh_glossary_updated_at on public.glossary_terms;
create trigger bh_glossary_updated_at before update on public.glossary_terms
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- chapter_states (structured world-state snapshot per chapter)
-- =====================================================================
create table if not exists public.chapter_states (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  chapter_id  uuid not null references public.chapters(id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,   -- {locations, whoKnowsWhat, injuries, items, activeThreads}
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists bh_chapter_states_updated_at on public.chapter_states;
create trigger bh_chapter_states_updated_at before update on public.chapter_states
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- story_events (narrative chronology — distinct from Bible history)
-- =====================================================================
create table if not exists public.story_events (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  sort_order  int not null default 0,
  title       text not null,
  description text,
  chapter_id  uuid references public.chapters(id) on delete set null,
  state_id    uuid references public.chapter_states(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists bh_story_events_updated_at on public.story_events;
create trigger bh_story_events_updated_at before update on public.story_events
  for each row execute function bh_set_updated_at();

-- =====================================================================
-- Indexes
-- =====================================================================
create index if not exists idx_books_user_id          on public.books(user_id);
create index if not exists idx_chapters_book_order    on public.chapters(book_id, sort_order);
create index if not exists idx_cards_book_category    on public.cards(book_id, category);
create index if not exists idx_card_links_from        on public.card_links(from_card_id);
create index if not exists idx_card_links_to          on public.card_links(to_card_id);
create index if not exists idx_glossary_book          on public.glossary_terms(book_id);
create index if not exists idx_drafts_chapter         on public.drafts(chapter_id);
create index if not exists idx_story_events_book      on public.story_events(book_id, sort_order);
create index if not exists idx_branches_book          on public.branches(book_id);
create index if not exists idx_zones_book             on public.zones(book_id);
create index if not exists idx_chapter_states_book   on public.chapter_states(book_id);
create index if not exists idx_chapter_states_chapter on public.chapter_states(chapter_id);

-- =====================================================================
-- Row Level Security
-- Every table: owner can read/write only their own rows.
-- auth.uid() = user_id on every table.
-- =====================================================================

-- public.users: own row only
alter table public.users enable row level security;
drop policy if exists "own row" on public.users;
create policy "own row" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- helper: apply the same policy to a data table
do $$
declare t text;
begin
  foreach t in array array[
    'books','branches','chapters','drafts','zones','cards',
    'card_links','glossary_terms','chapter_states','story_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all
       using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end;
$$;

-- =====================================================================
-- Grants (required in addition to RLS)
-- RLS restricts WHICH rows a role can touch; GRANTs control whether the
-- role can touch the table AT ALL. Without these, every query fails with
-- "permission denied for table X" before RLS is ever evaluated.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- make future tables (created after this script runs) get the same grants
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- =====================================================================
-- Self-populating user_id
-- Lets every insert omit user_id safely — Postgres fills it from the
-- calling session automatically, so a route that forgets to set it
-- can't violate the "own rows" RLS policy by inserting a null owner.
-- =====================================================================
do $$ declare t text;
begin
  foreach t in array array[
    'books','branches','chapters','drafts','zones','cards',
    'card_links','glossary_terms','chapter_states','story_events'
  ]
  loop
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
  end loop;
end;
 $$;

-- =====================================================================
-- Backfill: mirror any auth.users rows created before the
-- bh_on_auth_user_created trigger existed (idempotent — safe to re-run
-- on every fresh project this schema is applied to).
-- =====================================================================
insert into public.users (id, email, created_at)
select id, email, created_at from auth.users
on conflict (id) do nothing;

-- =====================================================================
-- Done. Next: run supabase/seed.sql (Part B) to populate demo data.
-- =====================================================================

-- =====================================================================
-- GRANTs + user_id defaults + backfill (run after initial schema)
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter table public.books alter column user_id set default auth.uid();
alter table public.branches alter column user_id set default auth.uid();
alter table public.chapters alter column user_id set default auth.uid();
alter table public.drafts alter column user_id set default auth.uid();
alter table public.zones alter column user_id set default auth.uid();
alter table public.cards alter column user_id set default auth.uid();
alter table public.card_links alter column user_id set default auth.uid();
alter table public.glossary_terms alter column user_id set default auth.uid();
alter table public.chapter_states alter column user_id set default auth.uid();
alter table public.story_events alter column user_id set default auth.uid();
insert into public.users (id, email, created_at) select id, email, created_at from auth.users on conflict (id) do nothing;
