-- Store scenario pack metadata on examples
alter table ml.examples
  add column if not exists meta jsonb null;
