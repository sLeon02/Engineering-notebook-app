-- Run this in Supabase: Project -> SQL Editor -> New query -> paste -> Run

create extension if not exists "pgcrypto";

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  project text default '',
  title text default '',
  entry_date date default current_date,
  author text default '',
  notes text default '',
  generated text default '',
  ai_generated boolean default false,
  created_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references entries(id) on delete cascade,
  storage_path text not null,
  url text not null,
  caption text default '',
  created_at timestamptz default now()
);

-- Row Level Security
alter table entries enable row level security;
alter table photos enable row level security;

-- This app has no login screen (one shared classroom notebook using the
-- public anon key), so we allow the anon key to read/write everything.
-- If you add Supabase Auth later, tighten these policies to check auth.uid().
drop policy if exists "allow all entries" on entries;
create policy "allow all entries" on entries for all using (true) with check (true);

drop policy if exists "allow all photos" on photos;
create policy "allow all photos" on photos for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- Storage bucket: also create this in the dashboard (Storage -> New bucket)
--   name: notebook-photos
--   public: ON  (so generated image URLs can be sent straight to OpenAI
--                and rendered in <img> tags without extra signing)
--
-- Then add a storage policy allowing public uploads/reads. Easiest path:
-- Storage -> notebook-photos -> Policies -> New policy -> "Allow all"
-- for SELECT and INSERT, since this app is unauthenticated by design.
-- ---------------------------------------------------------------------
