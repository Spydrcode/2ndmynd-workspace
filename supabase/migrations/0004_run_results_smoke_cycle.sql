-- Add smoke cycle tracking to run_results
alter table ml.run_results
  add column if not exists smoke_cycle_id uuid;

create index if not exists run_results_smoke_cycle_idx
  on ml.run_results(smoke_cycle_id, created_at);
