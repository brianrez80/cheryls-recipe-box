-- Read-only. Run against the verified target immediately before an approved
-- rollout. Stop and review if any assertion fails; never repair history blindly.
begin read only;
do $$ begin
  if current_user <> 'postgres' then raise exception 'Use the database operator session'; end if;
  if to_regclass('public.recipes') is null or to_regclass('public.family_members') is null then
    raise exception 'Expected existing recipe schema is missing';
  end if;
  if to_regnamespace('recipe_private') is not null then
    raise exception 'Private security schema already exists; inspect prior rollout state';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='recipes') <> 17
    or (select count(*) from information_schema.columns where table_schema='public' and table_name='family_members') <> 4 then
    raise exception 'Column inventory differs from the inspected catalog; compare catalog-before.json';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.recipes'::regclass
    and conname='recipes_member_id_fkey' and confrelid='public.family_members'::regclass and confdeltype='n') then
    raise exception 'Recipe label foreign key differs from inspected schema';
  end if;
  if not exists(select 1 from storage.buckets where id='recipe-images') then
    raise exception 'Expected attachment bucket is missing';
  end if;
  if not has_table_privilege('postgres','auth.users','SELECT')
    or not has_table_privilege('postgres','auth.sessions','SELECT') then
    raise exception 'Authorization lookup owner lacks required Auth read privileges';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> 2
    or not exists(select 1 from supabase_migrations.schema_migrations where version='20260711054726' and name='add_recipe_review_workflow')
    or not exists(select 1 from supabase_migrations.schema_migrations where version='20260814014436' and name='add_legacy_recipe_links') then
    raise exception 'Migration history differs from inspected project; review before applying';
  end if;
end $$;
select current_database() as database_name, current_user as operator,
  'Schema/history preflight passed; separately verify the project ref is knpovxbqoohsddquiyjv' as result;
commit;
