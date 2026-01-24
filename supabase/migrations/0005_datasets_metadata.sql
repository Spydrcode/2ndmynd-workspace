-- Add metadata column for datasets
alter table ml.datasets
  add column if not exists metadata jsonb;
