import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const sid = '99999999-0000-4000-8000-000000000001';
const step = { id: '11111111-0000-4000-8000-000000000001', name: 'Write captions', model: 'default', systemPrompt: 'Write grounded captions.', userPrompt: 'Use the image and {{context}}.' };
const sample = { name: 'Test chain', description: 'Isolated fixture', caption_count: 5, steps: [step] };
async function session(id = admin, provider = 'google', method = 'oauth') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, session_id: sid, app_metadata: { provider }, amr: [{ method }] })]);
  await db.exec('set role authenticated');
}
async function rpc(name, args, casts = []) {
  const placeholders = args.map((_, i) => `$${i + 1}${casts[i] ? '::' + casts[i] : ''}`).join(',');
  return (await db.query(`select public.${name}(${placeholders}) result`, args)).rows[0].result;
}
const save = (data = sample, id = null, version = null) => rpc('chain_tool_save', [id, version, JSON.stringify(data)], ['uuid', 'integer', 'jsonb']);
const start = (chain, context = '') => rpc('chain_tool_start_run', [chain.id, chain.version, context]);
function results(run) {
  const captions = Array.from({ length: run.snapshot.caption_count }, (_, i) => `Caption ${i + 1}`);
  return {
    captions,
    traces: run.snapshot.steps.map((s, i, a) => ({ name: s.name, model: s.model === 'default' ? 'gemini-2.5-flash' : s.model, systemPrompt: s.systemPrompt, userPrompt: s.userPrompt, output: i === a.length - 1 ? JSON.stringify({ captions }) : 'Intermediate image description' })),
    output_paths: captions.map((_, i) => `${admin}/${run.id}/output-${i + 1}.jpg`),
  };
}
async function finish(run, result = results(run), status = 'succeeded') {
  await db.exec('reset role; set role service_role');
  const response = await rpc('chain_tool_finish_run', [run.id, status, JSON.stringify(result), status === 'failed' ? 'Provider unavailable.' : null], ['uuid', 'text', 'jsonb', 'text']);
  await session();
  return response;
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema storage;
    create table public.profiles(id uuid primary key,is_superadmin boolean not null default false);
    create table auth.sessions(id uuid primary key,user_id uuid not null);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create function private.require_superadmin() returns uuid language plpgsql stable security definer set search_path='' as $$
    declare u uuid:=auth.uid(); claims jsonb:=auth.jwt(); begin
      if u is null or claims->'app_metadata'->>'provider' is distinct from 'google'
       or not coalesce(claims->'amr','[]'::jsonb) @> '[{"method":"oauth"}]'::jsonb
       or not exists(select 1 from public.profiles where id=u and is_superadmin)
       or not exists(select 1 from auth.sessions where id=(claims->>'session_id')::uuid and user_id=u)
      then raise exception 'Google superadmin access required.' using errcode='42501'; end if; return u;
    end $$;
    revoke all on function private.require_superadmin() from public,anon,authenticated,service_role;
    insert into public.profiles values('${admin}',true),('${member}',false);
    insert into auth.sessions values('${sid}','${admin}');
  `);
  await db.exec(await readFile('supabase/chain-tool.sql', 'utf8'));

  for (const actor of [null, member]) {
    await session(actor);
    await assert.rejects(save(), /superadmin/);
    await assert.rejects(rpc('chain_tool_read', [null]), /superadmin/);
    await assert.rejects(rpc('chain_tool_runs_read', [null, null]), /superadmin/);
    await assert.rejects(rpc('chain_tool_delete', [admin, 1]), /superadmin/);
    await assert.rejects(rpc('chain_tool_start_run', [admin, 1, '']), /superadmin/);
  }
  await session(admin, 'email'); await assert.rejects(save(), /superadmin/);
  await session(admin, 'google', 'password'); await assert.rejects(save(), /superadmin/);
  await session();
  for (const bad of [
    { ...sample, admin: true }, { ...sample, name: '' }, { ...sample, caption_count: 0 },
    { ...sample, caption_count: 11 }, { ...sample, caption_count: '5' }, { ...sample, caption_count: 2.5 },
    { ...sample, steps: [] }, { ...sample, steps: Array(7).fill(step) }, { ...sample, steps: [step, step] },
    { ...sample, steps: [{ ...step, id: 'bad' }] }, { ...sample, steps: [{ ...step, model: 'https://evil.example' }] },
    { ...sample, steps: [{ ...step, systemPrompt: '' }] }, { ...sample, steps: [{ ...step, userPrompt: '{{unknown}}' }] },
  ]) await assert.rejects(save(bad));

  let chain = await save();
  assert.equal(chain.version, 1);
  assert.equal((await rpc('chain_tool_read', [chain.id])).rows[0].id, chain.id);
  await assert.rejects(save(sample, chain.id, 0), /another tab/);
  await assert.rejects(rpc('chain_tool_delete', [chain.id, 0]), /another tab/);
  const run = await start(chain, 'Image context');
  assert.equal(run.snapshot.caption_count, 5);
  assert.equal(run.context, 'Image context');
  assert.equal(run.input_path, `${admin}/${run.id}/input.jpg`);
  assert.equal(run.session_id, undefined);
  await assert.rejects(start(chain), /already running/);
  await assert.rejects(rpc('chain_tool_finish_run', [run.id, 'succeeded', JSON.stringify(results(run)), null], ['uuid', 'text', 'jsonb', 'text']), /permission denied/);
  chain = await save({ ...sample, name: 'Changed chain', caption_count: 3 }, chain.id, chain.version);
  assert.equal(run.snapshot.name, 'Test chain');
  assert.equal((await rpc('chain_tool_runs_read', [null, run.id])).rows[0].snapshot.caption_count, 5);
  for (const corrupt of [
    { ...results(run), output_paths: Array(5).fill('other-user/other-run/input.jpg') },
    { ...results(run), captions: ['same', 'SAME', 'third', 'fourth', 'fifth'] },
    { ...results(run), captions: ['one'] },
    { ...results(run), traces: [] },
    { ...results(run), traces: [{ ...results(run).traces[0], name: 'Another step' }] },
    { ...results(run), traces: [{ ...results(run).traces[0], model: 'malicious' }] },
    { ...results(run), traces: [{ ...results(run).traces[0], output: JSON.stringify({ captions: ['Different'] }) }] },
  ]) {
    await db.exec('reset role; set role service_role');
    await assert.rejects(rpc('chain_tool_finish_run', [run.id, 'succeeded', JSON.stringify(corrupt), null], ['uuid', 'text', 'jsonb', 'text']));
    await session();
  }
  const complete = await finish(run);
  assert.equal(complete.status, 'succeeded');
  assert.equal(complete.captions.length, 5);
  assert.equal(complete.session_id, undefined);
  await assert.rejects(finish(run), /no longer pending/);
  await session();
  await assert.rejects(start({ ...chain, version: 1 }), /latest revision/);
  await assert.rejects(start(chain, 'x'.repeat(2001)), /2000/);

  // Step array order is the execution order and each run freezes it.
  const steps = Array.from({ length: 6 }, (_, i) => ({ ...step, id: `11111111-0000-4000-8000-00000000000${i + 1}`, name: `Step ${i + 1}` }));
  chain = await save({ ...sample, caption_count: 10, steps: steps.toReversed() }, chain.id, chain.version);
  const six = await start(chain);
  assert.equal(six.snapshot.steps[0].name, 'Step 6');
  assert.equal((await finish(six)).captions.length, 10);

  // Role or session revocation during an external call blocks trusted finish.
  const revoked = await start(chain);
  await db.exec(`reset role; delete from auth.sessions where id='${sid}'`);
  await assert.rejects(finish(revoked), /active superadmin session/);
  await db.exec(`reset role; insert into auth.sessions values('${sid}','${admin}'); update public.profiles set is_superadmin=false where id='${admin}'`);
  await assert.rejects(finish(revoked), /active superadmin session/);
  await db.exec(`reset role; update public.profiles set is_superadmin=true where id='${admin}'`);
  await finish(revoked, {}, 'failed');

  // Expired leases are visible as failures, cannot finish, and permit retry.
  const expired = await start(chain);
  await db.exec(`reset role; update public.chain_tool_runs set lease_expires_at=now()-interval '1 second' where id='${expired.id}'`);
  await session();
  assert.equal((await rpc('chain_tool_runs_read', [null, expired.id])).rows[0].status, 'failed');
  await assert.rejects(finish(expired), /no longer pending/);
  await session();
  const retry = await start(chain);
  await finish(retry, {}, 'failed');
  for (let i = 0; i < 5; i++) await finish(await start(chain), {}, 'failed');
  await assert.rejects(start(chain), /10 runs/);

  // Soft deletion hides chain editing while keeping immutable run history.
  await rpc('chain_tool_delete', [chain.id, chain.version]);
  assert.equal((await rpc('chain_tool_read', [chain.id])).rows.length, 0);
  assert.equal((await rpc('chain_tool_runs_read', [chain.id, run.id])).rows[0].snapshot.name, 'Test chain');
  await assert.rejects(save(sample, chain.id, chain.version), /not found/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(db.query('select * from public.chain_tool_chains'), /permission denied/);
    await assert.rejects(db.query('select * from public.chain_tool_runs'), /permission denied/);
  }
  await db.exec('reset role; set role anon');
  await assert.rejects(rpc('chain_tool_read', [null]), /permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select public from storage.buckets where id='chain-tool-media'")).rows[0].public, false);
  assert.equal((await db.query("select count(*)::int n from pg_class where relname in ('chain_tool_chains','chain_tool_runs') and relrowsecurity")).rows[0].n, 2);
  console.log('Chain database checks passed: authorization, revisions, snapshots, ordering, limits, paths, revocation, history and RLS.');
} finally { await db.close(); }
