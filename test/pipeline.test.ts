import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCorpus } from '../lib/fixtures/corpus.ts';
import { checkPlantedCases } from '../lib/fixtures/check.ts';
import { normalizeDate } from '../lib/pipeline/parser-extract.ts';
import { runPipeline } from '../lib/pipeline/run.ts';
import type { ExtractionStage } from '../lib/agent/types.ts';

const corpus = generateCorpus();
const inputs = corpus.files.map((f) => ({ filename: f.filename, bytes: f.bytes }));

test('end to end: model stage stubbed → parser fallback still yields a timeline', async () => {
  const run = await runPipeline(inputs);
  assert.ok(run.extraction.every((e) => e.usedFallback && e.primaryError === 'not_implemented'));
  assert.equal(run.timeline.coverage.sources.length, 4);
  assert.ok(run.timeline.entries.length > 100);
  assert.equal(run.timeline.coverage.dateSpan.start, '2024-01');
});

test('end to end: a model failure (not just a stub) also falls back', async () => {
  const flaky: ExtractionStage = { name: 'flaky', extractor: 'muse-spark-open', extract: async () => { throw new Error('timeout'); } };
  const run = await runPipeline(inputs, flaky);
  assert.ok(run.extraction.every((e) => e.usedFallback && e.primaryError === 'model_call_failed'));
});

test('every parser field cites spans that exist in its document', async () => {
  const run = await runPipeline(inputs);
  const spanIds = new Set(run.documents.flatMap((d) => d.spans.map((s) => s.id)));
  for (const f of run.timeline.entries) {
    assert.ok(f.spanIds.length > 0, f.id);
    for (const id of f.spanIds) assert.ok(spanIds.has(id), `${f.id} cites missing span ${id}`);
  }
});

test('every non-ambiguous parser value appears verbatim in its first span', async () => {
  const run = await runPipeline(inputs);
  const spanText = new Map(run.documents.flatMap((d) => d.spans.map((s) => [s.id, s.rawText] as const)));
  for (const f of run.timeline.entries.filter((e) => e.value !== null && e.ambiguity === null)) {
    assert.ok(spanText.get(f.spanIds[0]!)!.includes(f.value!), `${f.id}: "${f.value}" not in span`);
  }
});

test('all planted cases are present after parsing', async () => {
  const run = await runPipeline(inputs);
  for (const c of checkPlantedCases(corpus.manifest, run.documents, run.timeline.entries)) assert.ok(c.ok, `${c.id}: ${c.detail}`);
});

test('timeline is chronological with undated entries last', async () => {
  const { entries } = (await runPipeline(inputs)).timeline;
  const dates = entries.map((e) => e.date);
  const firstNull = dates.indexOf(null);
  assert.ok(dates.slice(firstNull).every((d) => d === null));
  const dated = dates.slice(0, firstNull) as string[];
  assert.deepEqual(dated, [...dated].sort());
});

test('normalizeDate keeps ISO, converts US dates, rejects unknown', () => {
  assert.equal(normalizeDate('2025-03-13'), '2025-03-13');
  assert.equal(normalizeDate('03/13/2025'), '2025-03-13');
  assert.equal(normalizeDate('2024-07'), '2024-07');
  assert.equal(normalizeDate('next Tuesday'), null);
  assert.equal(normalizeDate(null), null);
});
