create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.learning_vectors (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  source text not null check (source in ('mock', 'real')),
  industry_key text,
  created_at timestamptz not null default now(),
  schema_version text not null default 'v1',
  embedding_model text not null,
  embedding_dim int not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}',
  summary text not null,
  unique (run_id, embedding_model),
  check (embedding_dim = 1536)
);

create index if not exists learning_vectors_created_at_idx
  on public.learning_vectors (created_at desc);

create index if not exists learning_vectors_embedding_idx
  on public.learning_vectors
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.learning_vectors enable row level security;

create policy "service role only"
on public.learning_vectors
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.match_learning_vectors_v1 (
  query_embedding vector(1536),
  match_count int default 5,
  filter_source text default null,
  filter_industry text default null,
  filter_model text default null
)
returns table (
  id uuid,
  run_id text,
  source text,
  industry_key text,
  created_at timestamptz,
  summary text,
  metadata jsonb,
  embedding_model text,
  embedding_dim int,
  similarity float
)
language sql stable
as $$
  select
    lv.id,
    lv.run_id,
    lv.source,
    lv.industry_key,
    lv.created_at,
    lv.summary,
    lv.metadata,
    lv.embedding_model,
    lv.embedding_dim,
    1 - (lv.embedding <=> query_embedding) as similarity
  from public.learning_vectors lv
  where
    (filter_source is null or lv.source = filter_source)
    and (filter_industry is null or lv.industry_key = filter_industry)
    and (filter_model is null or lv.embedding_model = filter_model)
  order by lv.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_learning_vectors (
  query_embedding vector(1536),
  match_count int default 5,
  filter_source text default null,
  filter_industry text default null
)
returns table (
  id uuid,
  run_id text,
  source text,
  industry_key text,
  created_at timestamptz,
  summary text,
  metadata jsonb,
  embedding_model text,
  embedding_dim int,
  similarity float
)
language sql stable
as $$
  select * from public.match_learning_vectors_v1(
    query_embedding,
    match_count,
    filter_source,
    filter_industry,
    null
  );
$$;

-- After large backfills, run: ANALYZE public.learning_vectors;
