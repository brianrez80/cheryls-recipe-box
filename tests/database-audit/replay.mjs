import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '../..');
const bootstrap = `
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema extensions; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true)) $$;
grant usage on schema auth to anon, authenticated, service_role;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
`;
for (const repo of ["cheryls-recipe-box"]) {
 const db = new PGlite({extensions:{vector}});
 try {
  await db.exec(bootstrap);
  const dir = path.join(root,'supabase/migrations');
  for (const file of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()) {
   try { await db.exec(fs.readFileSync(path.join(dir,file),'utf8')); }
   catch(e) { throw new Error(`${file}: ${e.message}`); }
  }
  const tables = (await db.query(`select c.relname name,c.relrowsecurity rls,
   has_table_privilege('anon',c.oid,'SELECT') anon_read,
   has_table_privilege('authenticated',c.oid,'SELECT') auth_read,
   has_table_privilege('service_role',c.oid,'SELECT') server_read,
   has_table_privilege('service_role',c.oid,'INSERT') server_insert
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`)).rows;
  assert(tables.every(t=>t.rls), 'Every public table must have RLS');
  console.log(repo, 'FRESH REPLAY PASS', tables.length, 'tables');
  if(repo==='ai-with-brian-and-breanna') {
   await db.exec(`insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
    set role service_role;
    select public.grant_premium_learning_access('evt_synthetic','cs_synthetic','00000000-0000-4000-8000-000000000001',null,100,'usd');
    select public.grant_premium_learning_access('evt_synthetic','cs_synthetic','00000000-0000-4000-8000-000000000001',null,100,'usd');
    reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';`);
   assert.equal((await db.query('select * from public.premium_learning_entitlements')).rows.length,1);
   await db.exec(`set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';`);
   assert.equal((await db.query('select * from public.premium_learning_entitlements')).rows.length,0);
   await assert.rejects(db.query('select * from public.premium_learning_purchases'), /permission denied/);
   await assert.rejects(db.query(`select public.grant_premium_learning_access('evil','evil','00000000-0000-4000-8000-000000000002',null,0,'usd')`), /permission denied/);
   await db.exec('reset role; set role anon');
   await assert.rejects(db.query('select * from public.premium_learning_entitlements'), /permission denied/);
   console.log(repo,'PASS: webhook RPC, replay idempotency, own/other user, private purchases, unauthorized RPC, anonymous denial');
  }
  if(repo==='trixie-technologies') {
   for (const n of [1,2]) {
    const id = `00000000-0000-4000-8000-00000000000${n}`;
    await db.exec(`insert into auth.users values ('${id}'); set role service_role;`);
    await db.query(`select public.nexus_provision_client_workspace($1, $2, $3, $4, 'Synthetic User', 'ready', $5, 'Synthetic Business', 'Synthetic', $6, 'UTC', $7, 'test', 'growth', 'Test Office', '{}'::jsonb, '[]'::jsonb)`,[id,'a'.repeat(64),id,`test${n}@example.invalid`,id,`synthetic-${n}`,`synthetic-${n}`]);
    await db.query(`select public.nexus_record_client_business_voice_usage($1,'2026-10-01',1,$2)`,[id,id]);
    await db.query(`select public.nexus_record_client_business_voice_usage($1,'2026-10-01',1,$2)`,[id,id]);
    await db.exec('reset role;');
   }
   await db.exec(`set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';`);
   for(const table of ['client_users','client_businesses','client_business_memberships','client_business_nexus_mappings','nexus_front_office_configurations','nexus_voice_usage_monthly']) {
    assert.equal((await db.query(`select * from public.${table}`)).rows.length,1,`${table}: isolation`);
   }
   assert.deepEqual((await db.query('select id,plan_id,status from public.nexus_clients')).rows.map(r=>r.id),['synthetic-1']);
   assert.equal(Number((await db.query('select used_minutes from public.nexus_voice_usage_monthly')).rows[0].used_minutes),1);
   await assert.rejects(db.query('select name from public.nexus_clients'),/permission denied/);
   await assert.rejects(db.query('select * from public.client_provisioning_receipts'),/permission denied/);
   await assert.rejects(db.query(`select public.nexus_record_client_business_voice_usage('00000000-0000-4000-8000-000000000001','2026-10-01',1,'00000000-0000-4000-8000-000000000003')`),/permission denied/);
   await db.exec('reset role; set role anon;');
   await assert.rejects(db.query('select * from public.client_users'),/permission denied/);
   await db.exec('reset role;');
   // A synthetic copy of the audited event-trigger mechanism tests ACL changes.
   await db.exec(`create function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path=pg_catalog as $$ declare cmd record; begin for cmd in select * from pg_event_trigger_ddl_commands() where command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') and object_type in ('table','partitioned table') loop if cmd.schema_name='public' then execute format('alter table if exists %s enable row level security',cmd.object_identity); end if; end loop; end; $$;
    create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rls_auto_enable();`);
   await db.exec(fs.readFileSync(path.join(dir,'20261020235503_restrict_rls_auto_enable_execution.sql'),'utf8'));
   assert.equal((await db.query(`select has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') x`)).rows[0].x,false);
   assert.equal((await db.query(`select has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') x`)).rows[0].x,false);
   await db.exec('create table public.synthetic_event_trigger_probe(id integer)');
   assert.equal((await db.query(`select relrowsecurity from pg_class where oid='public.synthetic_event_trigger_probe'::regclass`)).rows[0].relrowsecurity,true);
   console.log(repo,'PASS: two-tenant isolation, provisioning, usage retry idempotency, column restrictions, server-only denial, event trigger retained after execution revoke');
  }
  if(repo==='trixie-hq') {
   assert(tables.every(t=>t.server_read && t.server_insert));
   assert(tables.every(t=>!t.anon_read));
   const seq = (await db.query(`select has_sequence_privilege('service_role','public.ai_usage_id_seq','USAGE') a, has_sequence_privilege('service_role','public.talk_messages_sequence_no_seq','USAGE') b`)).rows[0];
   assert(seq.a && seq.b);
   await db.exec(`set role service_role; select public.check_pin_login_attempt(repeat('a',64),false); reset role; set role anon;`);
   await assert.rejects(db.query('select * from public.journal_entries'),/permission denied/);
   await db.exec('reset role; set role authenticated;');
   await assert.rejects(db.query('select * from public.agent_missions'),/permission denied/);
   console.log(repo,'PASS: explicit table/sequence grants, PIN RPC, anonymous journal and authenticated mission denial');
  }
 } catch(e) { console.log(repo,'FAIL:',e.message); process.exitCode=1; }
 finally { await db.close(); }
}
