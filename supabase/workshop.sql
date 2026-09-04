-- BookHub — Add workshop_notes column to books
-- Run in Supabase SQL Editor
alter table public.books add column if not exists workshop_notes text not null default '';
