-- Shared family recipe spaces. This is additive: no existing recipe columns
-- are changed or removed, and the nullable foreign key keeps older clients safe.

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists family_members_display_name_unique
  on public.family_members (lower(display_name));

alter table public.family_members enable row level security;

drop policy if exists "Family members are visible to recipe box visitors" on public.family_members;
create policy "Family members are visible to recipe box visitors"
  on public.family_members for select
  to anon, authenticated
  using (true);

insert into public.family_members (id, display_name, active)
values
  ('00000000-0000-4000-8000-000000000001', 'Cheryl', true),
  ('00000000-0000-4000-8000-000000000002', 'Tiffany', true)
on conflict (id) do update
  set display_name = excluded.display_name,
      active = excluded.active;

alter table public.recipes
  add column if not exists member_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_member_id_fkey'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_member_id_fkey
      foreign key (member_id)
      references public.family_members(id)
      on delete set null;
  end if;
end $$;

alter table public.recipes
  alter column member_id set default '00000000-0000-4000-8000-000000000001'::uuid;

-- All existing recipes remain available and become Cheryl's recipes unless a
-- future data cleanup explicitly assigns them elsewhere.
update public.recipes
  set member_id = '00000000-0000-4000-8000-000000000001'::uuid
  where member_id is null;

create index if not exists recipes_member_id_idx on public.recipes (member_id);

comment on table public.family_members is
  'Members of the shared family Recipe Box. Add a row to create a new recipe space.';
comment on column public.recipes.member_id is
  'Owning family member for this recipe; legacy recipes are migrated to Cheryl.';
