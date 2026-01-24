create table if not exists ml.model_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  model_id text not null,
  status text not null,
  notes text,
  updated_at timestamptz not null default now()
);
