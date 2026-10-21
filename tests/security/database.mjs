import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname,'../..');
const migrationDir = path.join(root,'supabase/migrations');
const securityFile = '20261021015453_secure_shared_recipe_box.sql';
const security = fs.readFileSync(path.join(migrationDir,securityFile),'utf8');
const enrollment = fs.readFileSync(path.join(root,'supabase/admin/enroll.sql'),'utf8');
const preflight = fs.readFileSync(path.join(root,'supabase/admin/preflight.sql'),'utf8');
const manifest = fs.readFileSync(path.join(root,'supabase/admin/preservation-manifest.sql'),'utf8');
const emergencyLock = fs.readFileSync(path.join(root,'supabase/admin/emergency-lock.sql'),'utf8');
const ids = {brian:'10000000-0000-4000-8000-000000000001',cheryl:'10000000-0000-4000-8000-000000000002',stranger:'10000000-0000-4000-8000-000000000003'};
const sessions = {brian:'20000000-0000-4000-8000-000000000001',cheryl:'20000000-0000-4000-8000-000000000002',stranger:'20000000-0000-4000-8000-000000000003'};
const bootstrap = `
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public to anon,authenticated,service_role;
create schema auth; create schema storage;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key,name text);
insert into supabase_migrations.schema_migrations values('20260711054726','add_recipe_review_workflow'),('20260814014436','add_legacy_recipe_links');
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
alter default privileges in schema public revoke all on tables from anon,authenticated,service_role;
alter default privileges in schema public revoke all on sequences from anon,authenticated,service_role;
`;
for (const mode of ['fresh','existing']) {
 const db = new PGlite();
 let checks=0;
 const check=(value,message)=>{assert(value,message);checks++;};
 const claims=(name,extra={})=>({sub:ids[name],session_id:sessions[name],role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,...extra});
 async function as(role,jwt,run) {
  await db.exec('begin');
  try {
   await db.exec(`set local role ${role}`);
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(jwt||{})]);
   const value=await run(); await db.exec('commit'); return value;
  } catch(e) { await db.exec('rollback'); throw e; }
 }
 const snapshot=async()=>({recipes:(await db.query('select to_jsonb(r) row from public.recipes r order by id')).rows,labels:(await db.query('select to_jsonb(m) row from public.family_members m order by id')).rows,objects:(await db.query('select to_jsonb(o) row from storage.objects o order by id')).rows});
 try {
  await db.exec(bootstrap);
  for(const file of fs.readdirSync(migrationDir).filter(f=>f.endsWith('.sql')&&f!==securityFile).sort()) await db.exec(fs.readFileSync(path.join(migrationDir,file),'utf8'));
  if(mode==='existing') {
   // Reproduce observed live ACLs/policies, using synthetic contents only.
   await db.exec(`grant all on public.recipes,public.family_members to anon,authenticated,service_role;
    create policy "Allow recipe access" on public.recipes for all using(true) with check(true);
    insert into public.recipes(id,name,cook_time,main_category,ethnicity,notes,image_url,status,original_image_urls,ocr_text,contributor_name,reviewed_at,reviewed_by,video_url,source_url,member_id)
    values ('30000000-0000-4000-8000-000000000001','Synthetic legacy soup','25 min','Soup','American','Preserve all details','["https://knpovxbqoohsddquiyjv.supabase.co/storage/v1/object/public/recipe-images/recipes/legacy.jpg"]','approved',array['legacy-original'],'Synthetic OCR','Historical label','2026-01-01','Historical reviewer','https://example.invalid/video','https://example.invalid/recipe','00000000-0000-4000-8000-000000000002'),
    ('30000000-0000-4000-8000-000000000002','Synthetic draft',null,'Dessert','Other','Draft metadata',null,'draft',array['another-original'],'Unreviewed OCR',null,null,null,null,null,null);
    insert into storage.buckets values('recipe-images','recipe-images',true);
    insert into storage.objects(bucket_id,name,metadata) values ('recipe-images','recipes/legacy.jpg','{"contentType":"image/jpeg"}');
    create policy "Allow image uploads" on storage.objects for insert with check(bucket_id='recipe-images');
    create policy "Allow image updates" on storage.objects for update using(bucket_id='recipe-images');
    create policy "Allow image deletes" on storage.objects for delete using(bucket_id='recipe-images');`);
  }
  // A permissive policy from another integration cannot defeat the new fence.
  await db.exec(`create policy synthetic_other_integration on storage.objects for all to anon,authenticated using(true) with check(true);`);
  const before=await snapshot();
  const beforePrivileges=(await db.query("select relname,relacl,relrowsecurity from pg_class where oid in ('public.recipes'::regclass,'public.family_members'::regclass,'storage.objects'::regclass) order by relname")).rows;
  const beforeManifest=(await db.exec(manifest)).find(result=>result.rows?.length===3)?.rows;
  check(Boolean(beforeManifest),'Preservation manifest executes');
  if(mode==='existing') await db.exec(preflight);
  // Exercise a failure late in the transaction: permissions, schema and data
  // must all return to their prior state without restoring a data backup.
  await assert.rejects(db.exec(security.replace(/commit;\s*$/, 'select 1 / 0; commit;')),/division by zero/);
  await db.exec('rollback');
  check((await db.query("select to_regnamespace('recipe_private') as namespace")).rows[0].namespace===null,'Failed migration rolls back private schema');
  assert.deepEqual((await db.query("select relname,relacl,relrowsecurity from pg_class where oid in ('public.recipes'::regclass,'public.family_members'::regclass,'storage.objects'::regclass) order by relname")).rows,beforePrivileges);checks++;
  assert.deepEqual(await snapshot(),before);checks++;
  await db.exec(security);
  assert.deepEqual(await snapshot(),before);checks++;
  assert.deepEqual((await db.exec(manifest)).find(result=>result.rows?.length===3)?.rows,beforeManifest);checks++;
  check((await db.query("select public from storage.buckets where id='recipe-images'")).rows[0].public===false,'Private bucket');
  for(const [name,id] of Object.entries(ids)) {
   await db.query('insert into auth.users values($1,$2,now(),null,false)',[id,`${name}@example.invalid`]);
   await db.query('insert into auth.sessions values($1,$2,null)',[sessions[name],id]);
  }
  await assert.rejects(db.exec(enrollment),/required/);checks++;
  await db.exec('begin');
  for(const [name,id] of Object.entries(ids).filter(([name])=>name!=='stranger')) {
   await db.query('select set_config($1,$2,true)',[`recipebox.${name}_id`,id]);
   await db.query('select set_config($1,$2,true)',[`recipebox.${name}_email`,`${name}@example.invalid`]);
  }
  await db.exec(enrollment); await db.exec(enrollment); await db.exec('commit');
  check((await db.query('select count(*)::int n from recipe_private.authorized_users')).rows[0].n===2,'Exactly two seats; idempotent enrollment');
  for(const sql of ['select * from public.recipes',"insert into public.recipes(name,main_category,ethnicity,notes) values('x','Soup','Other','x')","update public.recipes set notes='attacker'","delete from public.recipes"]) {
   await assert.rejects(as('anon',{},()=>db.query(sql)),/permission denied/);checks++;
  }
  for(const jwt of [claims('stranger',{user_metadata:{seat:'brian'}}),claims('brian',{exp:1}),claims('brian',{session_id:'forged'}),claims('brian',{exp:'not-an-expiry'}),{}]) {
   check((await as('authenticated',jwt,()=>db.query('select * from public.recipes'))).rows.length===0,'Unauthorized/expired/forged session cannot read');
   await assert.rejects(as('authenticated',jwt,()=>db.query("insert into public.recipes(name,main_category,ethnicity,notes,member_id) values('attack','Soup','Other','x','00000000-0000-4000-8000-000000000001')")),/row-level security/);checks++;
   check((await as('authenticated',jwt,()=>db.query("update public.recipes set notes='attack' returning id"))).rows.length===0,'Unauthorized update denied');
   check((await as('authenticated',jwt,()=>db.query('delete from public.recipes returning id'))).rows.length===0,'Unauthorized delete denied');
  }
  for(const name of ['brian','cheryl']) {
   check((await as('authenticated',claims(name),()=>db.query('select public.recipe_box_access() allowed'))).rows[0].allowed===true,'Authorized admission');
   await assert.rejects(as('authenticated',claims(name),()=>db.query("insert into recipe_private.authorized_users(seat,user_id) values('brian',$1)",[ids.stranger])),/permission denied/);checks++;
   await assert.rejects(as('authenticated',claims(name),()=>db.query('select * from recipe_private.authorized_users')),/permission denied/);checks++;
   await assert.rejects(as('authenticated',claims(name),()=>db.query("update recipe_private.authorized_users set user_id=$1 where seat='cheryl'",[ids.stranger])),/permission denied/);checks++;
   await assert.rejects(as('authenticated',claims(name),()=>db.query('delete from recipe_private.authorized_users')),/permission denied/);checks++;
   await assert.rejects(as('authenticated',claims(name),()=>db.query('insert into auth.users(id) values(gen_random_uuid())')),/permission denied/);checks++;
  }
  const created=(await as('authenticated',claims('brian'),()=>db.query("insert into public.recipes(name,main_category,ethnicity,notes,member_id) values('Shared test','Soup','Other','Created by Brian','00000000-0000-4000-8000-000000000002') returning id"))).rows[0].id;
  check((await as('authenticated',claims('cheryl'),()=>db.query('select * from public.recipes where id=$1',[created]))).rows.length===1,'Same collection across identities');
  await as('authenticated',claims('cheryl'),()=>db.query("update public.recipes set notes='Edited by Cheryl' where id=$1",[created]));
  check((await as('authenticated',claims('brian'),()=>db.query('select notes from public.recipes where id=$1',[created]))).rows[0].notes==='Edited by Cheryl','Shared edits');
  await as('authenticated',claims('cheryl'),()=>db.query('delete from public.recipes where id=$1',[created]));
  const other=(await as('authenticated',claims('cheryl'),()=>db.query("insert into public.recipes(name,main_category,ethnicity,notes) values('Second shared test','Soup','Other','Cheryl created') returning id"))).rows[0].id;
  await as('authenticated',claims('brian'),()=>db.query("update public.recipes set notes='Brian edited' where id=$1",[other]));
  await as('authenticated',claims('brian'),()=>db.query('delete from public.recipes where id=$1',[other]));checks+=3;
  for(const role of ['anon','authenticated']) {
   const jwt=role==='anon'?{}:claims('stranger');
   check((await as(role,jwt,()=>db.query("select * from storage.objects where bucket_id='recipe-images'"))).rows.length===0,'Private image read denied despite other permissive policy');
   await assert.rejects(as(role,jwt,()=>db.query("insert into storage.objects(bucket_id,name) values('recipe-images','forged.jpg')")),/row-level security/);checks++;
  }
  const image=(await as('authenticated',claims('brian'),()=>db.query("insert into storage.objects(bucket_id,name) values('recipe-images','recipes/test.jpg') returning id"))).rows[0].id;
  check((await as('authenticated',claims('cheryl'),()=>db.query('select id from storage.objects where id=$1',[image]))).rows.length===1,'Shared private attachment');
  await as('authenticated',claims('cheryl'),()=>db.query("update storage.objects set name='recipes/changed.jpg' where id=$1",[image]));
  await as('authenticated',claims('brian'),()=>db.query('delete from storage.objects where id=$1',[image]));checks+=2;
  // Removing a session revokes access even before the JWT expires.
  await db.query('delete from auth.sessions where id=$1',[sessions.brian]);
  check((await as('authenticated',claims('brian'),()=>db.query('select public.recipe_box_access() allowed'))).rows[0].allowed===false,'Revoked session denied');
  await assert.rejects(db.exec(emergencyLock),/approval/);await db.exec('rollback');checks++;
  await db.exec("set recipebox.approved_lock='yes'");await db.exec(emergencyLock);
  for(const name of ['brian','cheryl']) check((await as('authenticated',claims(name),()=>db.query('select public.recipe_box_access() allowed'))).rows[0].allowed===false,'Operator emergency lock denies access');
  assert.deepEqual(await snapshot(),before);checks++;
  assert.deepEqual((await db.exec(manifest)).find(result=>result.rows?.length===3)?.rows,beforeManifest);checks++;
  console.log(`${mode}: PASS (${checks} checks; complete recipe/label/object preservation)`);
 } finally { await db.close(); }
}
