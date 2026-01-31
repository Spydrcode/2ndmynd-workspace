create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'run_status') then
    create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed');
  end if;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique,
  name text null,
  created_at timestamptz not null default now()
);

create table if not exists public.data_packs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  source_tool text not null,
  storage_paths text[] not null default '{}',
  normalized_json jsonb not null,
  stats_json jsonb not null default '{}'
);

create table if not exists public.runs (
  run_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pack_id uuid not null references public.data_packs(id) on delete cascade,
  status public.run_status not null default 'queued',
  mode text not null default 'mock',
  input_hash text null,
  website_url text null,
  created_at timestamptz not null default now(),
  results_json jsonb null,
  business_profile_json jsonb null,
  error text null
);

create table if not exists public.remote_assist_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  tool text null,
  notes text null,
  status text not null default 'requested',
  cal_link text null,
  run_id uuid null references public.runs(run_id)
);

alter table public.workspaces enable row level security;
alter table public.data_packs enable row level security;
alter table public.runs enable row level security;
alter table public.remote_assist_requests enable row level security;

create policy "workspaces owner access"
  on public.workspaces
  for all
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "data_packs owner access"
  on public.data_packs
  for all
  to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

create policy "runs owner access"
  on public.runs
  for all
  to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

create policy "remote assist owner access"
  on public.remote_assist_requests
  for all
  to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_user_id = auth.uid()
  ));

create policy "service role full access on workspaces"
  on public.workspaces
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access on data_packs"
  on public.data_packs
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access on runs"
  on public.runs
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access on remote assist requests"
  on public.remote_assist_requests
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists runs_workspace_created_idx
  on public.runs (workspace_id, created_at desc);
