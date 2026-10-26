-- REVIEW ONLY. This interrupts the current browser application.
-- Requires Brian's explicit approval and a coordinated authentication rollout.
-- Not included in supabase/migrations. Remove the guard ONLY during an approved
-- containment procedure after capturing existing ACLs for rollback.
begin;
do $$ begin raise exception 'Review-only containment: approval and auth rollout required'; end $$;
revoke all on table public.recipes from public, anon, authenticated;
revoke all on table public.family_members from public, anon, authenticated;
-- RLS and all recipe data remain unchanged. Server privileges remain unchanged.
commit;
