-- Add eval fields to runs and widen run_type for eval baselines
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'ml'
      and table_name = 'runs'
      and column_name = 'run_type'
      and data_type <> 'text'
  ) then
    execute 'alter table ml.runs alter column run_type type text using run_type::text';
  end if;
end $$;

alter table ml.runs
  alter column run_type set default 'eval';

alter table ml.runs
  add column if not exists model_id text null,
  add column if not exists dataset_name text null,
  add column if not exists eval_mode text null,
  add column if not exists notes jsonb null;

create index if not exists runs_type_created_at_idx
  on ml.runs (run_type, created_at desc);

create index if not exists runs_model_id_idx
  on ml.runs (model_id);

create index if not exists runs_dataset_name_idx
  on ml.runs (dataset_name);
