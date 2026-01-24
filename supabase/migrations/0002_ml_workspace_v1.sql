-- ML Workspace v1
create schema if not exists ml;

-- Enable UUID generation for primary keys
create extension if not exists pgcrypto;

-- Enums
create type ml.example_purpose as enum ('train', 'eval');
create type ml.example_quality as enum ('draft', 'reviewed', 'approved', 'retired');
create type ml.run_type as enum ('finetune', 'eval');
create type ml.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- Tables
create table ml.examples (
  id uuid primary key default gen_random_uuid(),
  purpose ml.example_purpose not null,
  schema_version text not null,
  input_snapshot jsonb not null,
  target_output jsonb not null,
  tags text[] not null default '{}',
  vertical text null,
  quality ml.example_quality not null default 'draft',
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ml.datasets (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  purpose ml.example_purpose not null,
  schema_version text not null,
  description text null,
  example_ids uuid[] not null default '{}',
  frozen_at timestamptz null,
  created_at timestamptz not null default now()
);

create table ml.runs (
  id uuid primary key default gen_random_uuid(),
  run_type ml.run_type not null,
  run_status ml.run_status not null default 'queued',
  base_model text null,
  result_model text null,
  dataset_name text null,
  openai_job_id text null,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ml.run_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ml.runs(id) on delete cascade,
  example_id uuid not null references ml.examples(id) on delete cascade,
  model text not null,
  output jsonb not null,
  scores jsonb not null default '{}',
  pass boolean not null default false,
  created_at timestamptz not null default now()
);

-- updated_at triggers
create or replace function ml.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger examples_set_updated_at
before update on ml.examples
for each row
execute function ml.set_updated_at();

create trigger runs_set_updated_at
before update on ml.runs
for each row
execute function ml.set_updated_at();

-- RLS
alter table ml.examples enable row level security;
alter table ml.datasets enable row level security;
alter table ml.runs enable row level security;
alter table ml.run_results enable row level security;

alter table ml.examples force row level security;
alter table ml.datasets force row level security;
alter table ml.runs force row level security;
alter table ml.run_results force row level security;

-- Default deny: no anon/authenticated policies are created.
-- TODO: add an ml_admin app_metadata role with limited access.

create policy "service role full access on examples"
  on ml.examples
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access on datasets"
  on ml.datasets
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access on runs"
  on ml.runs
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role full access on run_results"
  on ml.run_results
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Indexes
create index examples_purpose_idx on ml.examples (purpose);
create index examples_schema_version_idx on ml.examples (schema_version);
create index examples_quality_idx on ml.examples (quality);
create index examples_tags_gin_idx on ml.examples using gin (tags);

create index runs_type_status_idx on ml.runs (run_type, run_status);

create index run_results_run_id_idx on ml.run_results (run_id);
create index run_results_example_id_idx on ml.run_results (example_id);
