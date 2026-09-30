-- RLS / constraint smoke test for the initial schema. Runs in a transaction and rolls back.
-- Run: docker exec -i supabase_db_System-design-simulator psql -U postgres -d postgres < supabase/scripts/rls_smoke.sql
-- (Git Bash: prefix with MSYS_NO_PATHCONV=1). Lines saying "expect" show the correct result; ERROR lines are expected rejections.
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
begin;
-- two users signing up (profile trigger should fire)
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','ada@x.test','{"full_name":"Ada L","avatar_url":"https://a/p.png"}'),
 ('22222222-2222-2222-2222-222222222222','bob@x.test','{"name":"Bob"}');
select 'profiles created: ' || count(*) from public.profiles;
select 'ada profile: ' || username || ' / ' || display_name from public.profiles where id='11111111-1111-1111-1111-111111111111';

-- act as Ada
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
insert into public.projects (id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','Ada private');
insert into public.projects (id,name,visibility) values ('aaaaaaaa-0000-0000-0000-000000000002','Ada public','public');
insert into public.project_versions (project_id, graph, version_number) values ('aaaaaaaa-0000-0000-0000-000000000001','{"nodes":[],"edges":[]}', 99);
insert into public.project_versions (project_id, graph, version_number) values ('aaaaaaaa-0000-0000-0000-000000000001','{"nodes":[1],"edges":[]}', 99);
select 'version numbers (expect 1,2): ' || string_agg(version_number::text, ',' order by version_number) from public.project_versions;
savepoint sp;
update public.project_versions set message='x';  -- expect immutable error
rollback to savepoint sp;
insert into public.share_links (version_id) select id from public.project_versions where version_number=1;
select 'token length: ' || char_length(token) from public.share_links;
savepoint sp;
insert into public.simulations (version_id, duration_seconds, seed, status) select id, 60, 42, 'completed' from public.project_versions where version_number=1; -- expect check violation
rollback to savepoint sp;
select 'ada sees projects: ' || count(*) from public.projects;

-- act as Bob
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select 'bob sees projects (expect 1 public): ' || count(*) from public.projects;
select 'bob sees versions of ada private (expect 0): ' || count(*) from public.project_versions;
select 'bob sees share links (expect 0): ' || count(*) from public.share_links;
savepoint sp;
update public.projects set name='hacked' where id='aaaaaaaa-0000-0000-0000-000000000002';
rollback to savepoint sp;
select 'public project name still: ' || name from public.projects where id='aaaaaaaa-0000-0000-0000-000000000002';
savepoint sp;
insert into public.projects (name, owner_id) values ('spoof','11111111-1111-1111-1111-111111111111'); -- expect RLS violation
rollback to savepoint sp;

reset role;
savepoint sp; update public.project_versions set message='x'; rollback to savepoint sp;
-- signed-out visitor
select token as tok from public.share_links limit 1 \gset
reset role; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select 'anon sees projects (expect 1): ' || count(*) from public.projects;
select 'anon sees share_links (expect 0): ' || count(*) from public.share_links;
select 'anon via share token (expect 1 row): ' || count(*) from public.get_shared_version(:'tok');
reset role; update public.share_links set revoked_at = now(); set local role anon;
select 'anon via revoked token (expect 0): ' || count(*) from public.get_shared_version(:'tok');
select 'anon via bad token (expect 0): ' || count(*) from public.get_shared_version('nope');
rollback;
