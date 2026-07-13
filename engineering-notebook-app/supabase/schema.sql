-- ============================================================================
-- FRESH SETUP: run this whole file in Supabase -> SQL Editor -> New query.
-- If you already have data from the old single-user version, use
-- supabase/migrate-to-multiuser.sql instead (see that file's instructions).
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project text default '',
  title text default '',
  entry_date date default current_date,
  author text default '',
  notes text default '',
  generated text default '',
  ai_generated boolean default false,
  entered_by text default '',
  entered_on date,
  witness_by text default '',
  witness_on date,
  created_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid references entries(id) on delete cascade,
  storage_path text not null,
  url text not null,
  caption text default '',
  created_at timestamptz default now()
);

create index if not exists entries_owner_idx on entries(owner_id);
create index if not exists photos_owner_idx on photos(owner_id);
create index if not exists photos_entry_idx on photos(entry_id);

-- Row Level Security: every signed-in user can only see/edit their own rows.
alter table entries enable row level security;
alter table photos enable row level security;

drop policy if exists "allow all entries" on entries;
drop policy if exists "entries owner access" on entries;
create policy "entries owner access" on entries
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "allow all photos" on photos;
drop policy if exists "photos owner access" on photos;
create policy "photos owner access" on photos
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ============================================================================
-- Storage bucket setup (do this in the dashboard, not SQL):
--
-- 1. Storage -> New bucket -> name exactly: notebook-photos -> Public bucket: ON
--    (kept public so the stored URL can be sent straight to Gemini/rendered in
--    <img> tags; access is still limited by the fact that paths are namespaced
--    per user below, and nobody can list/browse the bucket without the exact URL)
--
-- 2. Storage -> notebook-photos -> Policies -> New policy, and create these
--    two policies (use "For full customization" so you can paste the check):
--
--    Policy A — allow signed-in users to upload only into their own folder:
--      operation: INSERT
--      target roles: authenticated
--      USING/WITH CHECK expression:
--        (storage.foldername(name))[1] = auth.uid()::text
--
--    Policy B — allow signed-in users to manage (update/delete) their own files:
--      operation: UPDATE, DELETE
--      target roles: authenticated
--      USING expression:
--        (storage.foldername(name))[1] = auth.uid()::text
--
--    Public SELECT (read) can stay open (this is what lets photo URLs render
--    and lets Gemini fetch them) — the bucket's default public-read already
--    covers this, no extra SELECT policy is required.
--
-- The app uploads photos to a path like  {user_id}/{entry_id}/{filename}
-- so the (storage.foldername(name))[1] check above lines up correctly.
-- ============================================================================
