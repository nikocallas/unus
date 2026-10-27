-- Unus run log. Created in-window (Oct 27, 2026) in the fresh Unus Supabase project.
-- Stores run metadata (counts, engines, timing). A full passport snapshot is allowed ONLY for the
-- synthetic sample corpus; uploaded records are never stored (enforced by the check constraint).
-- Fail-closed: RLS on, no client policies, no anon/authenticated grants. The server writes with the
-- service-role key.

create table public.unus_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  corpus text not null check (corpus in ('sample', 'upload')),
  document_count integer not null check (document_count >= 0),
  entry_count integer not null check (entry_count >= 0),
  verified_count integer not null check (verified_count >= 0),
  held_count integer not null check (held_count >= 0),
  conflict_count integer not null check (conflict_count >= 0),
  extract_engine text not null,
  normalize_engine text not null,
  review_engine text not null,
  used_fallback boolean not null,
  duration_ms integer not null check (duration_ms >= 0),
  passport jsonb,
  constraint unus_runs_passport_sample_only check (passport is null or corpus = 'sample')
);

alter table public.unus_runs enable row level security;
revoke all on table public.unus_runs from anon, authenticated;

create index unus_runs_created_at_idx on public.unus_runs (created_at desc);
