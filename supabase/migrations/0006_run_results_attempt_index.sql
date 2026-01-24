alter table ml.run_results
  add column if not exists attempt_index int;

create index if not exists run_results_smoke_example_attempt_idx
  on ml.run_results (smoke_cycle_id, example_id, attempt_index);
