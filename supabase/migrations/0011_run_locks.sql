-- Add run_locks table for workspace-scoped run concurrency control
-- This prevents overlapping runs for the same workspace

create table if not exists public.run_locks (
  workspace_id uuid not null,
  lock_id uuid not null,
  owner text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now() not null,
  constraint run_locks_pkey primary key (workspace_id)
);

-- Index for cleanup queries
create index if not exists run_locks_expires_at_idx on public.run_locks (expires_at);

-- RLS policies (match existing patterns)
alter table public.run_locks enable row level security;

create policy "Users can manage their workspace locks"
  on public.run_locks
  for all
  using (
    workspace_id in (
      select id from public.workspaces where owner_user_id = auth.uid()
    )
  );

-- Grant access to service role
grant all on public.run_locks to service_role;
