// Server-side run log in the Unus Supabase project. Never load-bearing: if env is missing or the
// write fails, the run still completes and the passport stays session-local.
// Uploaded records are never sent here — only counts and engine names. A passport snapshot is
// sent only for the synthetic sample corpus (the table also enforces this).

import type { Env } from '../models/clients.ts';
import type { Passport } from '../pipeline/passport.ts';

export type PersistStatus = 'stored' | 'not_configured' | 'failed';

export async function recordRun(passport: Passport, durationMs: number, env: Env, fetchImpl: typeof fetch = fetch): Promise<PersistStatus> {
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 'not_configured';
  const row = {
    corpus: passport.corpus,
    document_count: passport.documents.length,
    entry_count: passport.coverage.entries,
    verified_count: passport.coverage.verifiedValues,
    held_count: passport.coverage.heldForReview,
    conflict_count: passport.coverage.conflicts,
    extract_engine: passport.engines.extract,
    normalize_engine: passport.engines.normalize,
    review_engine: passport.engines.review,
    used_fallback: passport.stages.some((s) => s.fallback),
    duration_ms: Math.max(0, Math.round(durationMs)),
    passport: passport.corpus === 'sample' ? passport : null,
  };
  try {
    const res = await fetchImpl(`${url}/rest/v1/unus_runs`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? 'stored' : 'failed';
  } catch {
    return 'failed';
  }
}
