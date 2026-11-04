-- Independent Quip Chains tool. Requires the existing private.require_superadmin()
-- Google OAuth + active-session boundary. No existing pipeline data is changed.
begin;

create function private.chain_tool_valid_steps(p_steps jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare s jsonb;
begin
 if jsonb_typeof(p_steps) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_steps) not between 1 and 6 then return false; end if;
 for s in select value from jsonb_array_elements(p_steps) loop
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(s) k where k not in ('id','name','model','systemPrompt','userPrompt')) then return false; end if;
  if jsonb_typeof(s->'id') is distinct from 'string' or (s->>'id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   or jsonb_typeof(s->'name') is distinct from 'string' or length(btrim(s->>'name')) not between 1 and 120
   or jsonb_typeof(s->'model') is distinct from 'string'
   or ((s->>'model') <> 'default' and (s->>'model') !~ '^gemini-[a-zA-Z0-9._-]{1,100}$')
   or jsonb_typeof(s->'systemPrompt') is distinct from 'string' or length(btrim(s->>'systemPrompt')) not between 1 and 8000
   or jsonb_typeof(s->'userPrompt') is distinct from 'string' or length(btrim(s->>'userPrompt')) not between 1 and 8000
  then return false; end if;
  if exists(select 1 from regexp_matches((s->>'systemPrompt') || (s->>'userPrompt'), '\{\{([^{}]+)\}\}', 'g') token where token[1] not in ('context','previous_output','caption_count')) then return false; end if;
 end loop;
 return (select count(distinct lower(value->>'id')) from jsonb_array_elements(p_steps))=jsonb_array_length(p_steps);
end $$;
revoke all on function private.chain_tool_valid_steps(jsonb) from public,anon,authenticated,service_role;

create table public.chain_tool_chains (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 120),
 description text not null default '' check(length(description)<=1000),
 steps jsonb not null check(private.chain_tool_valid_steps(steps)),
 caption_count integer not null default 5 check(caption_count between 1 and 10),
 version integer not null default 1 check(version>0),
 created_by uuid not null, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index chain_tool_chains_updated_idx on public.chain_tool_chains(updated_at desc,id) where deleted_at is null;
create table public.chain_tool_runs (
 id uuid primary key default gen_random_uuid(),
 chain_id uuid not null references public.chain_tool_chains(id),
 chain_version integer not null, snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','succeeded','failed')),
 context text not null default '' check(length(context)<=2000),
 input_path text not null,
 output_paths jsonb not null default '[]'::jsonb check(jsonb_typeof(output_paths)='array'),
 captions jsonb not null default '[]'::jsonb check(jsonb_typeof(captions)='array'),
 traces jsonb not null default '[]'::jsonb check(jsonb_typeof(traces)='array'),
 error text check(length(error)<=500),
 created_by uuid not null, session_id uuid not null,
 created_at timestamptz not null default now(), finished_at timestamptz,
 lease_expires_at timestamptz not null default now()+interval '300 seconds'
);
create index chain_tool_runs_actor_time_idx on public.chain_tool_runs(created_by,created_at desc);
create index chain_tool_runs_chain_time_idx on public.chain_tool_runs(chain_id,created_at desc,id);
alter table public.chain_tool_chains enable row level security;
alter table public.chain_tool_runs enable row level security;
revoke all on public.chain_tool_chains,public.chain_tool_runs from public,anon,authenticated,service_role;

create function public.chain_tool_read(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_superadmin();
 select coalesce(jsonb_agg(to_jsonb(d) order by d.updated_at desc,d.id),'[]'::jsonb) into result
 from public.chain_tool_chains d where deleted_at is null and (p_id is null or d.id=p_id);
 return jsonb_build_object('rows',result);
end $$;

create function public.chain_tool_save(p_id uuid default null,p_version integer default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_superadmin(); d public.chain_tool_chains; count_value integer;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid chain.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','description','steps','caption_count'))
  or jsonb_typeof(p_data->'name') is distinct from 'string'
  or (p_data ? 'description' and jsonb_typeof(p_data->'description') is distinct from 'string')
  or not private.chain_tool_valid_steps(p_data->'steps')
  or (p_data ? 'caption_count' and (jsonb_typeof(p_data->'caption_count') is distinct from 'number' or (p_data->>'caption_count') !~ '^[0-9]{1,2}$'))
 then raise exception 'Check the chain name, caption count and prompt steps.' using errcode='22023'; end if;
 count_value:=coalesce((p_data->>'caption_count')::integer,5);
 if count_value not between 1 and 10 then raise exception 'Choose 1 to 10 captions.' using errcode='22023'; end if;
 if p_id is null then
  insert into public.chain_tool_chains(name,description,steps,caption_count,created_by)
   values(btrim(p_data->>'name'),coalesce(p_data->>'description',''),p_data->'steps',count_value,actor) returning * into d;
 else
  select * into d from public.chain_tool_chains where id=p_id and deleted_at is null for update;
  if not found then raise exception 'Chain not found.' using errcode='P0002'; end if;
  if p_version is distinct from d.version then raise exception 'Chain changed in another tab. Reload before saving.' using errcode='40001'; end if;
  update public.chain_tool_chains set name=btrim(p_data->>'name'),description=coalesce(p_data->>'description',''),steps=p_data->'steps',caption_count=count_value,version=version+1,updated_at=now()
   where id=p_id returning * into d;
 end if;
 return to_jsonb(d);
end $$;

create function public.chain_tool_delete(p_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.chain_tool_chains;
begin
 perform private.require_superadmin();
 select * into d from public.chain_tool_chains where id=p_id and deleted_at is null for update;
 if not found then raise exception 'Chain not found.' using errcode='P0002'; end if;
 if p_version is distinct from d.version then raise exception 'Chain changed in another tab. Reload before deleting.' using errcode='40001'; end if;
 update public.chain_tool_chains set deleted_at=now(),updated_at=now(),version=version+1 where id=p_id;
 return jsonb_build_object('id',p_id);
end $$;

create function public.chain_tool_start_run(p_chain_id uuid,p_version integer,p_context text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_superadmin(); d public.chain_tool_chains; r public.chain_tool_runs; run_id uuid:=gen_random_uuid();
begin
 if p_context is null or length(p_context)>2000 then raise exception 'Context must be at most 2000 characters.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('chain-tool-run:'||actor::text,0));
 update public.chain_tool_runs set status='failed',error='Run expired. Start a new run.',finished_at=now() where created_by=actor and status='pending' and lease_expires_at<=now();
 if exists(select 1 from public.chain_tool_runs where created_by=actor and status='pending') then raise exception 'A chain is already running. Wait before running another.' using errcode='55000'; end if;
 if (select count(*) from public.chain_tool_runs where created_by=actor and created_at>now()-interval '1 hour')>=10 then raise exception 'You have reached 10 runs this hour. Try again later.' using errcode='54000'; end if;
 select * into d from public.chain_tool_chains where id=p_chain_id and deleted_at is null for update;
 if not found then raise exception 'Chain not found.' using errcode='P0002'; end if;
 if p_version is distinct from d.version then raise exception 'Chain changed. Save and run the latest revision.' using errcode='40001'; end if;
 insert into public.chain_tool_runs(id,chain_id,chain_version,snapshot,context,input_path,created_by,session_id)
 values(run_id,d.id,d.version,jsonb_build_object('id',d.id,'name',d.name,'description',d.description,'steps',d.steps,'caption_count',d.caption_count,'version',d.version),p_context,actor::text||'/'||run_id::text||'/input.jpg',actor,(auth.jwt()->>'session_id')::uuid) returning * into r;
 return to_jsonb(r)-'session_id';
end $$;

create function public.chain_tool_runs_read(p_chain_id uuid default null,p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_superadmin();
 select coalesce(jsonb_agg(to_jsonb(r)-'session_id' || case when r.status='pending' and r.lease_expires_at<=now() then jsonb_build_object('status','failed','error','Run expired. Start a new run.') else '{}'::jsonb end order by r.created_at desc,r.id),'[]'::jsonb) into result
 from (select * from public.chain_tool_runs where (p_chain_id is null or chain_id=p_chain_id) and (p_id is null or id=p_id) order by created_at desc,id limit 100) r;
 return jsonb_build_object('rows',result);
end $$;

-- Only trusted server code can finalize a provider run. It must still belong
-- to a live, currently privileged session, and outputs cannot point elsewhere.
create function public.chain_tool_finish_run(p_id uuid,p_status text,p_result jsonb,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.chain_tool_runs; trace jsonb; caption jsonb; i integer; expected integer; final_captions jsonb;
begin
 select * into r from public.chain_tool_runs where id=p_id for update;
 if not found then raise exception 'Run not found.' using errcode='P0002'; end if;
 if r.status<>'pending' or r.lease_expires_at<=now() then raise exception 'Run is no longer pending. Start a new run.' using errcode='40001'; end if;
 if p_status is null or p_status not in ('succeeded','failed') then raise exception 'Invalid run status.' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles where id=r.created_by and is_superadmin)
  or not exists(select 1 from auth.sessions where id=r.session_id and user_id=r.created_by)
 then raise exception 'The run owner no longer has an active superadmin session.' using errcode='42501'; end if;
 if p_status='succeeded' then
  if jsonb_typeof(p_result) is distinct from 'object' or length(p_result::text)>500000 then raise exception 'Invalid run results.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_result) k where k not in ('captions','traces','output_paths'))
   or jsonb_typeof(p_result->'traces') is distinct from 'array' or jsonb_typeof(p_result->'captions') is distinct from 'array' or jsonb_typeof(p_result->'output_paths') is distinct from 'array'
  then raise exception 'Invalid run results.' using errcode='22023'; end if;
  expected:=(r.snapshot->>'caption_count')::integer;
  if jsonb_array_length(p_result->'traces')<>jsonb_array_length(r.snapshot->'steps') or jsonb_array_length(p_result->'captions')<>expected or jsonb_array_length(p_result->'output_paths')<>expected then raise exception 'Incomplete run results.' using errcode='22023'; end if;
  for i in 0..jsonb_array_length(r.snapshot->'steps')-1 loop
   trace:=p_result->'traces'->i;
   if jsonb_typeof(trace) is distinct from 'object' then raise exception 'Invalid step trace.' using errcode='22023'; end if;
   if exists(select 1 from jsonb_object_keys(trace) k where k not in ('name','model','systemPrompt','userPrompt','output'))
    or trace->>'name' is distinct from r.snapshot->'steps'->i->>'name'
    or jsonb_typeof(trace->'model') is distinct from 'string' or (trace->>'model') !~ '^gemini-[a-zA-Z0-9._-]{1,100}$'
    or (r.snapshot->'steps'->i->>'model'<>'default' and trace->>'model' is distinct from r.snapshot->'steps'->i->>'model')
    or jsonb_typeof(trace->'systemPrompt') is distinct from 'string' or length(trace->>'systemPrompt') not between 1 and 18000
    or jsonb_typeof(trace->'userPrompt') is distinct from 'string' or length(trace->>'userPrompt') not between 1 and 32000
    or jsonb_typeof(trace->'output') is distinct from 'string' or length(btrim(trace->>'output')) not between 1 and (case when i=jsonb_array_length(r.snapshot->'steps')-1 then 16000 else 8000 end)
   then raise exception 'Invalid step trace or model.' using errcode='22023'; end if;
  end loop;
  for i in 0..expected-1 loop
   caption:=p_result->'captions'->i;
   if jsonb_typeof(caption) is distinct from 'string' or length(btrim(caption#>>'{}')) not between 1 and 240 then raise exception 'Invalid caption.' using errcode='22023'; end if;
   if jsonb_typeof(p_result->'output_paths'->i) is distinct from 'string'
    or p_result->'output_paths'->>i is distinct from r.created_by::text||'/'||r.id::text||'/output-'||(i+1)::text||'.jpg'
   then raise exception 'Output path must belong to this run.' using errcode='22023'; end if;
  end loop;
  if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_result->'captions'))<>expected then raise exception 'Captions must be distinct.' using errcode='22023'; end if;
  -- The rendered caption list must match the final recorded provider output.
  final_captions:=(trace->>'output')::jsonb->'captions';
  if jsonb_typeof(final_captions) is distinct from 'array' then raise exception 'Final trace must contain captions.' using errcode='22023'; end if;
  if (select jsonb_agg(btrim(value) order by ordinality) from jsonb_array_elements_text(final_captions) with ordinality) is distinct from p_result->'captions' then raise exception 'Captions do not match the final trace.' using errcode='22023'; end if;
 end if;
 update public.chain_tool_runs set status=p_status,
  captions=case when p_status='succeeded' then p_result->'captions' else '[]'::jsonb end,
  traces=case when p_status='succeeded' then p_result->'traces' else '[]'::jsonb end,
  output_paths=case when p_status='succeeded' then p_result->'output_paths' else '[]'::jsonb end,
  error=case when p_status='failed' then left(coalesce(nullif(btrim(p_error),''),'Generation failed. Try again.'),500) else null end,
  finished_at=now() where id=r.id returning * into r;
 return to_jsonb(r)-'session_id';
end $$;

revoke all on function public.chain_tool_read(uuid),public.chain_tool_save(uuid,integer,jsonb),public.chain_tool_delete(uuid,integer),public.chain_tool_start_run(uuid,integer,text),public.chain_tool_runs_read(uuid,uuid),public.chain_tool_finish_run(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.chain_tool_read(uuid),public.chain_tool_save(uuid,integer,jsonb),public.chain_tool_delete(uuid,integer),public.chain_tool_start_run(uuid,integer,text),public.chain_tool_runs_read(uuid,uuid) to authenticated;
grant execute on function public.chain_tool_finish_run(uuid,text,jsonb,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chain-tool-media','chain-tool-media',false,8388608,array['image/jpeg']) on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='chain-tool-media' and public) then raise exception 'chain-tool-media must be private; inspect the existing bucket before applying.'; end if;
end $$;
-- Deliberately no authenticated storage policy. Session-checked server routes
-- serve private media and use trusted storage credentials only after auth.
commit;
