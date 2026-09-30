-- =============================================================================
-- SystemSim initial schema (MVP)
-- Requirements: docs/database-design.md -> "Schema brief (MVP)"
--
-- Ownership chain (every row resolves to one owner):
--   auth.users -> profiles -> projects -> project_versions -> simulations -> simulation_results
--                                                          -> share_links
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tables (parents before children)
-- -----------------------------------------------------------------------------

-- One profile per auth user. The primary key IS the auth user's id, so
-- auth.uid() matches it directly and deleting the user deletes the profile.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null
               check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  display_name text check (char_length(display_name) <= 100),
  avatar_url   text check (char_length(avatar_url) <= 2048),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  name        text not null
              check (char_length(btrim(name)) between 1 and 100),
  description text check (char_length(description) <= 1000),
  visibility  text not null default 'private'
              check (visibility in ('private', 'public')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Immutable snapshots of a project's graph. version_number is assigned by a
-- trigger (1, 2, 3... per project); any client-supplied value is overwritten.
create table public.project_versions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  -- The editor's { nodes, edges } as one document, capped at 1 MB.
  graph          jsonb not null
                 check (jsonb_typeof(graph) = 'object')
                 check (octet_length(graph::text) <= 1000000),
  message        text check (char_length(message) <= 500),
  created_at     timestamptz not null default now(),
  unique (project_id, version_number)
);

create table public.simulations (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references public.project_versions (id) on delete cascade,
  -- Validated scalars get columns; the rest of the workload (request mix,
  -- traffic pattern...) is engine-defined JSON, capped at 64 KB.
  duration_seconds integer not null check (duration_seconds between 1 and 3600),
  seed             bigint not null,
  workload         jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(workload) = 'object')
                   check (octet_length(workload::text) <= 65536),
  status           text not null default 'queued'
                   check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  error_message    text check (char_length(error_message) <= 2000),
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  -- Timestamps must agree with the status.
  constraint simulations_status_timestamps check (
       (status = 'queued'    and started_at is null     and finished_at is null)
    or (status = 'running'   and started_at is not null and finished_at is null)
    or (status in ('completed', 'failed')
                             and started_at is not null and finished_at >= started_at)
    or (status = 'cancelled' and finished_at is not null
                             and (started_at is null or finished_at >= started_at))
  )
);

-- At most one result per simulation: its primary key is the simulation's id.
create table public.simulation_results (
  simulation_id       uuid primary key references public.simulations (id) on delete cascade,
  throughput_rps      double precision not null check (throughput_rps >= 0),
  total_requests      bigint not null check (total_requests >= 0),
  successful_requests bigint not null check (successful_requests >= 0),
  failed_requests     bigint not null check (failed_requests >= 0),
  rejected_requests   bigint not null check (rejected_requests >= 0),
  timed_out_requests  bigint not null check (timed_out_requests >= 0),
  error_rate          double precision not null check (error_rate between 0 and 1),
  latency_p50_ms      double precision not null check (latency_p50_ms >= 0),
  latency_p95_ms      double precision not null check (latency_p95_ms >= latency_p50_ms),
  latency_p99_ms      double precision not null check (latency_p99_ms >= latency_p95_ms),
  -- Node id from the version's graph (graph ids are strings).
  bottleneck_node_id  text check (char_length(bottleneck_node_id) <= 200),
  -- Downsampled chart data (the engine sends at most a few hundred points), capped at 2 MB.
  timeseries          jsonb
                      check (octet_length(timeseries::text) <= 2000000),
  created_at          timestamptz not null default now(),
  check (successful_requests + failed_requests + rejected_requests + timed_out_requests
         <= total_requests)
);

create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.project_versions (id) on delete cascade,
  -- 64 hex chars from two random UUIDs (~244 random bits): unguessable.
  token       text not null unique
              default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
              check (char_length(token) >= 32),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 2. Indexes (one per query in the brief, plus foreign keys Postgres doesn't index)
-- -----------------------------------------------------------------------------

-- Usernames are unique regardless of case ("Ada" and "ada" clash).
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- Q1: my projects, most recently updated first (also serves owner_id FK).
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
-- Q5: browse public projects, most recently updated first.
create index projects_public_updated_idx on public.projects (updated_at desc)
  where visibility = 'public';
-- Q2: a project's versions, newest first -> served by unique (project_id, version_number).
-- Q3: a version's simulations, newest first (also serves version_id FK).
create index simulations_version_created_idx on public.simulations (version_id, created_at desc);
-- Q4: resolve a share token -> served by unique (token).
-- FK index for cascades and the owner's "links for this version" list.
create index share_links_version_idx on public.share_links (version_id);


-- -----------------------------------------------------------------------------
-- 3. Functions and triggers
-- -----------------------------------------------------------------------------

-- Keeps updated_at current on every UPDATE, whatever the client sends.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Creates the profile when Supabase Auth creates a user (OAuth sign-up).
-- security definer: runs as the function owner, since the signing-up user
-- can't insert into profiles themselves. search_path is pinned so nobody can
-- hijack unqualified names.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    -- Unique starting username; the user can rename it later.
    'user_' || left(replace(new.id::text, '-', ''), 12),
    left(coalesce(new.raw_user_meta_data ->> 'full_name',
                  new.raw_user_meta_data ->> 'name',
                  new.raw_user_meta_data ->> 'user_name'), 100),
    left(new.raw_user_meta_data ->> 'avatar_url', 2048)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Assigns the next version number within the project. Locking the project row
-- serializes concurrent saves, so two saves can't both get the same number.
create function public.assign_version_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.projects where id = new.project_id for update;
  select coalesce(max(version_number), 0) + 1
    into new.version_number
    from public.project_versions
   where project_id = new.project_id;
  return new;
end;
$$;

create trigger project_versions_assign_number
  before insert on public.project_versions
  for each row execute function public.assign_version_number();

-- Versions are immutable: the database refuses updates, even from the owner.
create function public.prevent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger project_versions_immutable
  before update on public.project_versions
  for each row execute function public.prevent_update();

-- Saving a version counts as updating the project (for "recently updated" lists).
create function public.touch_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return null;
end;
$$;

create trigger project_versions_touch_project
  after insert on public.project_versions
  for each row execute function public.touch_project();

-- Per-user quotas (spec section 11): stop one account from exhausting storage.
create function public.enforce_quotas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'projects' then
    if (select count(*) from public.projects where owner_id = new.owner_id) >= 50 then
      raise exception 'Project limit reached (50 per user)' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'project_versions' then
    if (select count(*) from public.project_versions where project_id = new.project_id) >= 200 then
      raise exception 'Version limit reached (200 per project)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_enforce_quota
  before insert on public.projects
  for each row execute function public.enforce_quotas();

create trigger project_versions_enforce_quota
  before insert on public.project_versions
  for each row execute function public.enforce_quotas();

-- Share-link access for anyone holding the token (signed in or not).
-- security definer bypasses RLS, so this function IS the access check:
-- it only returns the one version behind a valid, active token. Nobody can
-- list share_links directly (RLS below: owner only).
create function public.get_shared_version(share_token text)
returns table (
  project_name   text,
  version_number integer,
  graph          jsonb,
  message        text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, v.version_number, v.graph, v.message, v.created_at
    from public.share_links s
    join public.project_versions v on v.id = s.version_id
    join public.projects p on p.id = v.project_id
   where s.token = share_token
     and s.revoked_at is null
     and (s.expires_at is null or s.expires_at > now());
$$;

-- Functions are executable by PUBLIC by default; open only what the API needs.
revoke execute on function public.get_shared_version(text) from public;
grant execute on function public.get_shared_version(text) to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. Row Level Security: on for every table
-- -----------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.projects           enable row level security;
alter table public.project_versions   enable row level security;
alter table public.simulations        enable row level security;
alter table public.simulation_results enable row level security;
alter table public.share_links        enable row level security;


-- -----------------------------------------------------------------------------
-- 5. Policies. (select auth.uid()) is evaluated once per query, not per row.
-- -----------------------------------------------------------------------------

-- profiles: every field is public (username, display name, avatar), so anyone
-- can read them. Only the owner can edit. Insert happens via the sign-up
-- trigger; delete happens via the auth.users cascade.
create policy "profiles are readable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- projects
create policy "read own or public projects"
  on public.projects for select
  to anon, authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

create policy "create own projects"
  on public.projects for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "update own projects"
  on public.projects for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "delete own projects"
  on public.projects for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- project_versions: readable when the project is; written only by the owner.
-- No update policy, and the trigger above blocks updates anyway.
create policy "read versions of readable projects"
  on public.project_versions for select
  to anon, authenticated
  using (exists (
    select 1 from public.projects p
     where p.id = project_id
       and (p.visibility = 'public' or p.owner_id = (select auth.uid()))
  ));

create policy "create versions in own projects"
  on public.project_versions for insert
  to authenticated
  with check (exists (
    select 1 from public.projects p
     where p.id = project_id and p.owner_id = (select auth.uid())
  ));

create policy "delete versions in own projects"
  on public.project_versions for delete
  to authenticated
  using (exists (
    select 1 from public.projects p
     where p.id = project_id and p.owner_id = (select auth.uid())
  ));

-- simulations: owner only (not public, even on public projects).
create policy "owners manage their simulations"
  on public.simulations for all
  to authenticated
  using (exists (
    select 1 from public.project_versions v
      join public.projects p on p.id = v.project_id
     where v.id = version_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.project_versions v
      join public.projects p on p.id = v.project_id
     where v.id = version_id and p.owner_id = (select auth.uid())
  ));

-- simulation_results: owner only; written once, never edited.
create policy "owners read their results"
  on public.simulation_results for select
  to authenticated
  using (exists (
    select 1 from public.simulations s
      join public.project_versions v on v.id = s.version_id
      join public.projects p on p.id = v.project_id
     where s.id = simulation_id and p.owner_id = (select auth.uid())
  ));

create policy "owners insert their results"
  on public.simulation_results for insert
  to authenticated
  with check (exists (
    select 1 from public.simulations s
      join public.project_versions v on v.id = s.version_id
      join public.projects p on p.id = v.project_id
     where s.id = simulation_id and p.owner_id = (select auth.uid())
  ));

create policy "owners delete their results"
  on public.simulation_results for delete
  to authenticated
  using (exists (
    select 1 from public.simulations s
      join public.project_versions v on v.id = s.version_id
      join public.projects p on p.id = v.project_id
     where s.id = simulation_id and p.owner_id = (select auth.uid())
  ));

-- share_links: only the owner can see, create, revoke (update) or delete them.
-- Visitors never touch this table; they call get_shared_version(token).
create policy "owners manage their share links"
  on public.share_links for all
  to authenticated
  using (exists (
    select 1 from public.project_versions v
      join public.projects p on p.id = v.project_id
     where v.id = version_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.project_versions v
      join public.projects p on p.id = v.project_id
     where v.id = version_id and p.owner_id = (select auth.uid())
  ));
