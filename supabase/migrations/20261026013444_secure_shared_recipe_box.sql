-- Apply only with Brian's approval, AFTER verified Auth identities are ready
-- and BEFORE switching traffic to the replacement client. No recipe DML.
begin;
create schema recipe_private;
revoke all on schema recipe_private from public, anon, authenticated, service_role;
grant usage on schema recipe_private to authenticated;

-- Exactly two seats; no email/display-name based authorization and no browser
-- or service-role membership management. Enrollment is an operator-only step.
create table recipe_private.authorized_users (
  seat text primary key check (seat in ('brian', 'cheryl')),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  enrolled_at timestamptz not null default now()
);
alter table recipe_private.authorized_users enable row level security;
revoke all on recipe_private.authorized_users from public, anon, authenticated, service_role;

-- This narrow definer lookup is necessary because callers cannot read the
-- membership or Auth tables. No arguments, writes, dynamic SQL or user_metadata.
create function recipe_private.can_access_recipes()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from recipe_private.authorized_users member
    join auth.users identity on identity.id = member.user_id
    join auth.sessions session on session.user_id = identity.id
      and session.id::text = (select auth.jwt()->>'session_id')
    where member.user_id = (select auth.uid())
      and member.enabled
      and identity.email_confirmed_at is not null
      and identity.is_anonymous is not true
      and (identity.banned_until is null or identity.banned_until <= now())
      and (session.not_after is null or session.not_after > now())
      and (select auth.jwt()->>'role') = 'authenticated'
      and case when (select auth.jwt()->>'exp') ~ '^[0-9]{1,12}$'
        then (select auth.jwt()->>'exp')::numeric > extract(epoch from now())
        else false end
  );
$function$;
revoke all on function recipe_private.can_access_recipes() from public, anon, authenticated, service_role;
grant execute on function recipe_private.can_access_recipes() to authenticated;

-- Safe admission check for the client; returns only the caller's access state.
create function public.recipe_box_access()
returns boolean language sql stable security invoker set search_path = ''
as $$ select recipe_private.can_access_recipes() $$;
revoke all on function public.recipe_box_access() from public, anon, authenticated, service_role;
grant execute on function public.recipe_box_access() to authenticated;

alter table public.recipes enable row level security;
alter table public.family_members enable row level security;
-- Remove all legacy permissive policies, including differently named live ones.
do $$ declare policy record; begin
  for policy in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('recipes','family_members')
  loop execute format('drop policy %I on %I.%I',policy.policyname,policy.schemaname,policy.tablename); end loop;
end $$;
revoke all on table public.recipes, public.family_members from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert on public.family_members to authenticated;
-- These are recipe attribution labels, never authenticated identities.
create policy recipe_box_members on public.recipes for all to authenticated
  using ((select recipe_private.can_access_recipes()))
  with check ((select recipe_private.can_access_recipes()));
create policy recipe_labels_read on public.family_members for select to authenticated
  using ((select recipe_private.can_access_recipes()));
create policy recipe_labels_add on public.family_members for insert to authenticated
  with check ((select recipe_private.can_access_recipes())
    and char_length(btrim(display_name)) between 1 and 100);

-- Attachments must be private too. Stored URLs and object bytes are unchanged.
-- The browser resolves both legacy URLs and new paths via authenticated download.
insert into storage.buckets(id, name, public) values ('recipe-images','recipe-images',false)
  on conflict(id) do update set public = false;
drop policy if exists "Allow image uploads" on storage.objects;
drop policy if exists "Allow image updates" on storage.objects;
drop policy if exists "Allow image deletes" on storage.objects;
-- Restrictive fence also protects against an unexpected pre-existing permissive
-- storage policy, without changing authorization for unrelated buckets.
create policy recipe_images_anon_fence on storage.objects as restrictive for all to anon
  using (bucket_id <> 'recipe-images') with check (bucket_id <> 'recipe-images');
create policy recipe_images_fence on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'recipe-images' or (select recipe_private.can_access_recipes()))
  with check (bucket_id <> 'recipe-images' or (select recipe_private.can_access_recipes()));
create policy recipe_images_members on storage.objects for all to authenticated
  using (bucket_id = 'recipe-images' and (select recipe_private.can_access_recipes()))
  with check (bucket_id = 'recipe-images' and (select recipe_private.can_access_recipes()));
-- Storage service owns the storage schema/table grants; do not grant across it.
commit;
