-- Read-only aggregate checks. Save results privately before/after migration.
-- These fingerprints are integrity checks, not a backup or a file-byte hash.
begin read only;
set local timezone = 'UTC';
select 'recipes' as relation, count(*) as row_count,
  encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by id),''),'UTF8')),'hex') as fingerprint
from public.recipes r
union all
select 'family_members', count(*),
  encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),'' order by id),''),'UTF8')),'hex')
from public.family_members m
union all
select 'recipe_image_objects', count(*),
  encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex'),'' order by id),''),'UTF8')),'hex')
from storage.objects o where bucket_id='recipe-images';
commit;
