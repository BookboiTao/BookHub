-- =====================================================================
-- BookHub — AI provider keys (per-user API keys for Gemini / future providers)
-- Run in Supabase SQL Editor.
--
-- Stores each user's API key for a given provider. Keys are isolated by
-- RLS so a user only ever sees their own.
-- =====================================================================

create table if not exists public.ai_provider_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  provider      text not null,                    -- "gemini" | future: "openrouter" | ...
  api_key       text not null,                    -- the raw key (RLS-protected)
  label         text,                             -- optional friendly label
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, provider)
);

-- RLS — only the owning user can read/write their keys
alter table public.ai_provider_keys enable row level security;
drop policy if exists "own provider keys" on public.ai_provider_keys;
create policy "own provider keys" on public.ai_provider_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grants
grant select, insert, update, delete on public.ai_provider_keys to authenticated;

-- Index
create index if not exists idx_ai_provider_keys_user on public.ai_provider_keys(user_id, provider);

-- Updated_at trigger (reuse the existing function from schema.sql if present;
-- if not, fall back to a no-op-friendly inline definition)
drop trigger if exists bh_ai_provider_keys_updated_at on public.ai_provider_keys;
create trigger bh_ai_provider_keys_updated_at before update on public.ai_provider_keys
  for each row execute function bh_set_updated_at();
