// The agent workflow: ingest → extract → normalize → resolve → verify → timeline.
// Each Meta model stage is env-gated; when it cannot run or fails, the deterministic path runs
// and the stage report says so (fallback: true + reason). Nothing is faked.

import { extractDocument, type ExtractionResult } from '../agent/extract.ts';
import { deterministicConcepts, modelConcepts, type ConceptAssignment } from '../agent/normalize.ts';
import { resolveEntries } from '../agent/resolve.ts';
import { QUARANTINE_LABELS, reviewWithModel, verifyDeterministic, type VerificationResult } from '../agent/verify.ts';
import type { FieldCategory } from '../agent/types.ts';
import { errorCategory, museSparkClient, sparkOpenClient, type ChatClient, type Env } from '../models/clients.ts';
import { ingestFiles } from '../ingest/index.ts';
import type { InputFile } from '../types.ts';
import type { Passport, StageName, StageReport } from './passport.ts';

export interface ModelClients {
  sparkOpen: ChatClient | null;
  sparkOpenError: string | null;
  muse: ChatClient | null;
  museError: string | null;
}

export function clientsFromEnv(env: Env, fetchImpl: typeof fetch = fetch): ModelClients {
  const out: ModelClients = { sparkOpen: null, sparkOpenError: null, muse: null, museError: null };
  try { out.sparkOpen = sparkOpenClient(env, fetchImpl); } catch (err) { out.sparkOpenError = errorCategory(err); }
  try { out.muse = museSparkClient(env, fetchImpl); } catch (err) { out.museError = errorCategory(err); }
  return out;
}

export type RunEvent =
  | { type: 'stage-start'; stage: StageName; engine: string }
  | { type: 'stage-done'; report: StageReport }
  | { type: 'result'; passport: Passport };

const PARSER_ENGINE = 'Deterministic parsers (fallback)';
const RULES_ENGINE = 'Deterministic rules (fallback)';

export async function runPipeline(
  files: InputFile[],
  opts: { corpus: Passport['corpus']; clients: ModelClients; onEvent?: (e: RunEvent) => void; now?: () => Date },
): Promise<Passport> {
  const { clients, onEvent = () => {} } = opts;
  const stages: StageReport[] = [];
  const timed = async <T>(stage: StageName, engine: string, fn: () => Promise<T> | T, describe: (r: T) => Omit<StageReport, 'stage' | 'ms'>): Promise<T> => {
    onEvent({ type: 'stage-start', stage, engine });
    const t0 = performance.now();
    const result = await fn();
    const report: StageReport = { stage, ms: Math.round(performance.now() - t0), ...describe(result) };
    stages.push(report);
    onEvent({ type: 'stage-done', report });
    return result;
  };

  const docs = await timed('ingest', 'Deterministic parsers', () => ingestFiles(files), (d) => ({
    engine: 'Deterministic parsers',
    fallback: false,
    fallbackReason: null,
    detail: `${d.length} documents, ${d.reduce((n, x) => n + x.spans.length, 0)} source spans`,
  }));
  const usable = docs.filter((d) => d.status !== 'failed');

  const extraction = await timed(
    'extract',
    clients.sparkOpen?.label ?? PARSER_ENGINE,
    () => Promise.all(usable.map((d) => extractDocument(d, clients.sparkOpen, clients.sparkOpenError))),
    (r: ExtractionResult[]) => {
      const fellBack = r.filter((x) => x.usedFallback);
      return {
        engine: fellBack.length === r.length ? PARSER_ENGINE : clients.sparkOpen!.label,
        fallback: fellBack.length > 0,
        fallbackReason: fellBack[0]?.primaryError ?? null,
        detail: `${r.reduce((n, x) => n + x.fields.length, 0)} candidate fields${fellBack.length && fellBack.length < r.length ? ` (${fellBack.length} documents via parser fallback)` : ''}`,
      };
    },
  );
  const fields = extraction.flatMap((e) => e.fields);

  let normalizeFallback: string | null = clients.museError;
  const concepts = await timed('normalize', clients.muse?.label ?? RULES_ENGINE, async () => {
    if (clients.muse) {
      try { return await modelConcepts(fields, clients.muse); } catch (err) { normalizeFallback = errorCategory(err); }
    }
    return deterministicConcepts(fields);
  }, (m: Map<string, ConceptAssignment>) => ({
    engine: normalizeFallback ? RULES_ENGINE : clients.muse!.label,
    fallback: normalizeFallback !== null,
    fallbackReason: normalizeFallback,
    detail: `${new Set([...m.values()].map((c) => c.conceptKey)).size} concepts`,
  }));

  const spans = docs.flatMap((d) => d.spans);
  let reviewFallback: string | null = clients.museError;
  const verified = await timed('verify', clients.muse ? `Span checker + ${clients.muse.label}` : 'Span checker', async () => {
    const checked = verifyDeterministic(fields, spans);
    if (clients.muse) {
      try { return await reviewWithModel(checked, spans, clients.muse); } catch (err) { reviewFallback = errorCategory(err); }
    }
    return checked;
  }, (v: VerificationResult) => ({
    engine: reviewFallback ? 'Span checker (review pass not run)' : `Span checker + ${clients.muse!.label}`,
    fallback: reviewFallback !== null,
    fallbackReason: reviewFallback,
    detail: `${v.published.length} verified, ${v.quarantined.length} held for review`,
  }));

  const filenames = new Map(docs.map((d) => [d.document.id, d.document.filename]));
  const resolved = await timed('resolve', 'Deterministic resolver', () => resolveEntries(verified.published, concepts, filenames), (r) => ({
    engine: 'Deterministic resolver',
    fallback: false,
    fallbackReason: null,
    detail: `${r.entries.length} entries, ${r.entries.filter((e) => e.documentIds.length > 1).length} found in several documents, ${r.entries.filter((e) => e.conflict).length} with differing values`,
  }));

  const passport = await timed('timeline', 'Timeline assembly', () => {
    const dates = resolved.entries.map((e) => e.date);
    const byCategory: Record<FieldCategory, number> = { lab: 0, vital: 0, activity: 0, medication: 0, visit: 0 };
    for (const e of resolved.entries) byCategory[e.category]++;
    const p: Passport = {
      runAt: (opts.now?.() ?? new Date()).toISOString(),
      corpus: opts.corpus,
      engines: {
        extract: stages.find((s) => s.stage === 'extract')!.engine,
        normalize: stages.find((s) => s.stage === 'normalize')!.engine,
        review: stages.find((s) => s.stage === 'verify')!.engine,
      },
      stages,
      documents: docs.map((d) => ({
        id: d.document.id,
        filename: d.document.filename,
        type: d.document.type,
        sourceName: d.document.sourceName,
        date: d.document.date,
        status: d.status,
        spanCount: d.spans.length,
        issues: d.issues.map((i) => i.message),
      })),
      spans: spans.map(({ id, documentId, locator, rawText, ambiguity }) => ({ id, documentId, locator, rawText, ambiguity })),
      entries: resolved.entries,
      concepts: resolved.concepts,
      quarantined: verified.quarantined.map((q) => ({
        fieldId: q.field.id,
        label: q.field.label,
        value: q.field.value,
        unit: q.field.unit,
        dateAsPrinted: q.field.dateRaw,
        documentId: q.field.documentId,
        spanIds: q.field.spanIds,
        reason: q.reason,
        reasonLabel: QUARANTINE_LABELS[q.reason],
        detail: q.detail,
      })),
      coverage: {
        sources: docs.length,
        dateSpan: { start: dates[0] ?? null, end: dates[dates.length - 1] ?? null },
        entries: resolved.entries.length,
        verifiedValues: verified.published.length,
        heldForReview: verified.quarantined.length,
        conflicts: resolved.entries.filter((e) => e.conflict).length,
        multiDocumentEntries: resolved.entries.filter((e) => e.documentIds.length > 1).length,
        byCategory,
      },
    };
    return p;
  }, (p) => ({ engine: 'Timeline assembly', fallback: false, fallbackReason: null, detail: `${p.coverage.entries} timeline entries` }));

  // The timeline stage report was pushed after the passport object was created; keep them in sync.
  passport.stages = [...stages];
  onEvent({ type: 'result', passport });
  return passport;
}
