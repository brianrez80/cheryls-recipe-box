-- Allows the existing PIN-protected browser client to add a family member.
-- The unique display-name index from the ownership migration rejects duplicates.

alter table public.family_members enable row level security;

drop policy if exists "Family members can be added through recipe box" on public.family_members;
create policy "Family members can be added through recipe box"
  on public.family_members for insert
  to anon, authenticated
  with check (char_length(btrim(display_name)) between 1 and 100);

grant select, insert on table public.family_members to anon, authenticated;
