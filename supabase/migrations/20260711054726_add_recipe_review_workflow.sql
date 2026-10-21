-- RECOVERED FRESH BOOTSTRAP, based on the live catalog inspected 2026-10-20.
-- This is a reconstruction of the manually created schema plus review fields,
-- not a claim that the original review migration created all these objects.
-- The actual historical SQL is archived in docs/security/history/live-*.sql.txt.
-- The version is already recorded on the live project; do NOT replay there.
-- No migration-history row is inserted/updated by this file.
do $$ begin
  if to_regclass('public.recipes') is not null or to_regclass('public.family_members') is not null then
    raise exception 'Fresh bootstrap requires empty recipe tables; do not replay on an existing project';
  end if;
end $$;

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index family_members_display_name_unique on public.family_members(lower(display_name));
alter table public.family_members enable row level security;
-- Attribution labels only; these do not create users or grant access.
insert into public.family_members(id,display_name) values
  ('00000000-0000-4000-8000-000000000001','Cheryl'),
  ('00000000-0000-4000-8000-000000000002','Tiffany');

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cook_time text,
  main_category text not null,
  ethnicity text not null,
  notes text not null,
  image_url text,
  created_at timestamptz default now(),
  status text not null default 'approved' constraint recipes_status_check check (status in ('draft','approved')),
  original_image_urls text[] not null default '{}'::text[],
  ocr_text text,
  contributor_name text,
  reviewed_at timestamptz,
  reviewed_by text,
  video_url text,
  source_url text,
  member_id uuid default '00000000-0000-4000-8000-000000000001'::uuid,
  constraint recipes_member_id_fkey foreign key(member_id) references public.family_members(id) on delete set null
);
create index recipes_status_created_at_idx on public.recipes(status,created_at desc);
create index recipes_member_id_idx on public.recipes(member_id);
alter table public.recipes enable row level security;
-- Deliberately private with no API grants until the security migration follows.
