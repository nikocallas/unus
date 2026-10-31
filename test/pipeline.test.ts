import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildExport } from '../lib/export/bundle.ts';
import { generateCorpus } from '../lib/fixtures/corpus.ts';
import { checkPlantedCases } from '../lib/fixtures/check.ts';
import { ingestFiles } from '../lib/ingest/index.ts';
import { normalizeDate, extractWithParsers } from '../lib/pipeline/parser-extract.ts';
import { clientsFromEnv, runPipeline, type ModelClients } from '../lib/pipeline/run.ts';
import { buildTimeline } from '../lib/pipeline/timeline.ts';

const corpus = generateCorpus();
const inputs = corpus.files.map((f) => ({ filename: f.filename, bytes: f.bytes }));
const NO_MODELS: ModelClients = clientsFromEnv({});

test('integration: sample corpus runs end to end with labelled fallbacks when no Meta keys are set', async () => {
  const p = await runPipeline(inputs, { corpus: 'sample', clients: NO_MODELS });
  assert.deepEqual(p.stages.map((s) => s.stage), ['ingest', 'extract', 'normalize', 'verify', 'resolve', 'timeline']);
  const extract = p.stages.find((s) => s.stage === 'extract')!;
  assert.equal(extract.fallback, true);
  assert.equal(extract.fallbackReason, 'unavailable:missing_key:BASETEN_API_KEY');
  assert.equal(p.stages.find((s) => s.stage === 'normalize')!.fallbackReason, 'unavailable:missing_key:META_MODEL_API_KEY');
  assert.equal(p.coverage.sources, 4);
  assert.ok(p.entries.length > 100);
});

test('integration: every published value cites existing spans; quarantined fields appear nowhere as verified', async () => {
  const p = await runPipeline(inputs, { corpus: 'sample', clients: NO_MODELS });
  const spanIds = new Set(p.spans.map((s) => s.id));
  const publishedIds = new Set<string>();
  for (const e of p.entries) {
    for (const v of e.values) {
      assert.ok(v.spanIds.length > 0);
      for (const id of v.spanIds) assert.ok(spanIds.has(id), id);
      publishedIds.add(v.fieldId);
    }
  }
  for (const q of p.quarantined) assert.ok(!publishedIds.has(q.fieldId), `${q.fieldId} is both held and published`);
  const exported = buildExport(p);
  const exportedFieldIds = new Set(exported.record.entry.flatMap((x) => x.resource.unus.provenance.fieldIds));
  for (const q of p.quarantined) assert.ok(!exportedFieldIds.has(q.fieldId), `${q.fieldId} leaked into the verified export`);
  assert.equal(exported.heldForReview.items.length, p.quarantined.length);
});

test('verification gate holds the planted no-clean-span fields', async () => {
  const p = await runPipeline(inputs, { corpus: 'sample', clients: NO_MODELS });
  const ferritin = p.quarantined.find((q) => q.label === 'Ferritin');
  assert.equal(ferritin?.reason, 'ambiguous_span');
  const wearable = p.quarantined.filter((q) => q.spanIds.some((id) => id.includes('/records/18/')));
  assert.equal(wearable.length, 4);
  assert.equal(p.quarantined.length, 5);
});

test('entity resolution: A1c from two labs under two names lines up as one measure', async () => {
  const p = await runPipeline(inputs, { corpus: 'sample', clients: NO_MODELS });
  const a1c = p.concepts.find((c) => c.conceptKey === 'loinc:4548-4')!;
  assert.deepEqual(a1c.sources.map((x) => x.toLowerCase()).sort(), ['cascade synthetic laboratories', 'pinewood synthetic lab']);
  assert.ok(a1c.labelsAsPrinted.includes('HGB A1C') && a1c.labelsAsPrinted.includes('Hemoglobin A1c'));
});

test('conflicts: differing values sit side by side in one entry; agreeing values do not conflict', async () => {
  const p = await runPipeline(inputs, { corpus: 'sample', clients: NO_MODELS });
  const a1c = p.entries.find((e) => e.id === 'loinc:4548-4@2025-03-13')!;
  assert.equal(a1c.conflict, true);
  assert.deepEqual(a1c.values.map((v) => v.value).sort(), ['5.6', '5.8']);
  const weight = p.entries.find((e) => e.id === 'loinc:29463-7@2026-06-02')!;
  assert.equal(weight.conflict, true);
  assert.deepEqual(weight.values.map((v) => v.value).sort(), ['72.4', '72.9']);
  const ldl = p.entries.find((e) => e.id === 'loinc:13457-7@2025-03-13')!;
  assert.equal(ldl.values.length, 2);
  assert.equal(ldl.conflict, false);
  assert.equal(p.coverage.conflicts, 2);
});

test('export: FHIR-shaped bundle of verified resources plus a separate held-for-review section', async () => {
  const p = await runPipeline(inputs, { corpus: 'sample', clients: NO_MODELS });
  const ex = buildExport(p);
  assert.equal(ex.record.resourceType, 'Bundle');
  const types = new Set(ex.record.entry.map((e) => e.resource.resourceType));
  for (const t of ['Observation', 'DiagnosticReport', 'MedicationStatement', 'Encounter']) assert.ok(types.has(t as never), t);
  const a1c = ex.record.entry.map((e) => e.resource).find((r) => r.resourceType === 'Observation' && r.code.coding.some((c) => c.code === '4548-4') && r.effectiveDateTime === '2025-03-13');
  assert.ok(a1c && a1c.resourceType === 'Observation');
  assert.ok(a1c.referenceRange?.some((r) => r.text === '4.0-5.6'));
  assert.ok(a1c.unus.provenance.spanIds.length > 0);
  assert.match(ex.heldForReview.notice, /NOT VERIFIED/);
});

test('model-failure: a Meta client that errors falls back without crashing or inventing output', async () => {
  const failing: typeof fetch = async () => new Response('upstream error', { status: 503 });
  const clients = clientsFromEnv(
    { BASETEN_API_KEY: 'test', META_MODEL_API_KEY: 'test', META_MODEL_API_TIER: 'standard', META_SPARK_MODEL: 'muse-spark-test', META_MODEL_API_BASE_URL: 'https://example.invalid' },
    failing,
  );
  const p = await runPipeline(inputs, { corpus: 'sample', clients });
  for (const stage of ['extract', 'normalize', 'verify']) {
    const r = p.stages.find((s) => s.stage === stage)!;
    assert.equal(r.fallback, true, stage);
    assert.equal(r.fallbackReason, 'http_503', stage);
  }
  assert.ok(p.entries.every((e) => e.values.every((v) => v.extractor === 'parser')));
  assert.ok(p.entries.length > 100);
});

test('Standard tier is enforced: Muse Spark will not run without META_MODEL_API_TIER=standard', () => {
  const c = clientsFromEnv({ META_MODEL_API_KEY: 'k', META_SPARK_MODEL: 'm', META_MODEL_API_BASE_URL: 'https://x', META_MODEL_API_TIER: 'contributor' });
  assert.equal(c.muse, null);
  assert.equal(c.museError, 'unavailable:tier_not_standard:META_MODEL_API_TIER');
  const contributorModel = clientsFromEnv({ META_MODEL_API_KEY: 'k', META_SPARK_MODEL: 'muse-spark-1.3-contributor', META_MODEL_API_BASE_URL: 'https://x', META_MODEL_API_TIER: 'standard' });
  assert.equal(contributorModel.muse, null);
  assert.equal(contributorModel.museError, 'unavailable:tier_not_standard:META_SPARK_MODEL');
});

test('model path: Spark Open fields are gated — a hallucinated value or span never publishes', async () => {
  const lab = inputs.find((f) => f.filename.endsWith('.pdf'))!;
  const [doc] = ingestFiles([lab]);
  const row = doc!.spans.find((s) => s.rawText.startsWith('Hemoglobin A1c'))!.id;
  const dateSpan = doc!.spans.find((s) => s.rawText.includes('Collected:'))!.id;
  const reply = {
    fields: [
      { label: 'Hemoglobin A1c', value: '5.6', unit: '%', date_text: '2025-03-13', reference_range_text: '4.0-5.6', category: 'lab', span_ids: [row, dateSpan] },
      { label: 'Hemoglobin A1c', value: '9.9', unit: '%', date_text: '2025-03-13', category: 'lab', span_ids: [row, dateSpan] },
      { label: 'Vitamin B12', value: '400', unit: 'pg/mL', date_text: '2025-03-13', category: 'lab', span_ids: ['doc_fake:p9:l9'] },
    ],
  };
  const fakeBaseten: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init!.body)) as { model: string };
    assert.equal(String(url), 'https://inference.baseten.co/v1/chat/completions');
    assert.equal(body.model, 'meta-models/muse-spark-open-1026');
    return Response.json({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(reply)}\n\`\`\`` } }] });
  };
  const clients = clientsFromEnv({ BASETEN_API_KEY: 'test' }, fakeBaseten);
  const p = await runPipeline([lab], { corpus: 'upload', clients });
  assert.equal(p.stages.find((s) => s.stage === 'extract')!.fallback, false);
  const published = p.entries.flatMap((e) => e.values);
  assert.deepEqual(published.map((v) => v.value), ['5.6']);
  assert.equal(published[0]!.extractor, 'muse-spark-open');
  const held = Object.fromEntries(p.quarantined.map((q) => [q.value, q.reason]));
  assert.equal(held['9.9'], 'value_not_in_span');
  assert.equal(held['400'], 'no_source_span');
});

test('model path: Muse Spark review can hold a field but never publish a rejected one', async () => {
  const visit = inputs.find((f) => f.filename.endsWith('.txt'))!;
  let call = 0;
  const fakeMeta: typeof fetch = async (url, init) => {
    call++;
    assert.equal(String(url), 'https://meta.example/v1/messages');
    const body = JSON.parse(String(init!.body)) as { messages: { content: string }[] };
    if (call === 1) return Response.json({ content: [{ type: 'text', text: '{"concepts": []}' }] });
    const weightId = /"id":"([^"]+)","label":"Weight"/.exec(body.messages[0]!.content)![1];
    return Response.json({ content: [{ type: 'text', text: JSON.stringify({ unsupported: [{ id: weightId, why: 'test hold' }] }) }] });
  };
  const clients = clientsFromEnv({ META_MODEL_API_KEY: 'k', META_MODEL_API_TIER: 'standard', META_SPARK_MODEL: 'muse-spark-test', META_MODEL_API_BASE_URL: 'https://meta.example' }, fakeMeta);
  const p = await runPipeline([visit], { corpus: 'upload', clients });
  assert.equal(p.stages.find((s) => s.stage === 'verify')!.fallback, false);
  assert.ok(p.quarantined.some((q) => q.label === 'Weight' && q.reason === 'review_flagged'));
  assert.ok(!p.entries.some((e) => e.display === 'Body weight'));
});

test('phase 1 parser timeline still covers all planted cases', () => {
  const docs = ingestFiles(inputs);
  const fields = docs.flatMap((d) => extractWithParsers(d));
  const tl = buildTimeline(docs, fields);
  for (const c of checkPlantedCases(corpus.manifest, docs, tl.entries)) assert.ok(c.ok, `${c.id}: ${c.detail}`);
});

test('normalizeDate keeps ISO, converts US dates, rejects unknown', () => {
  assert.equal(normalizeDate('2025-03-13'), '2025-03-13');
  assert.equal(normalizeDate('03/13/2025'), '2025-03-13');
  assert.equal(normalizeDate('2024-07'), '2024-07');
  assert.equal(normalizeDate('next Tuesday'), null);
  assert.equal(normalizeDate(null), null);
});

test('unreadable uploads: failed documents are reported and no model is called for an empty run', async () => {
  let calls = 0;
  const counting: typeof fetch = async () => { calls++; return new Response('{}', { status: 500 }); };
  const clients = clientsFromEnv({ META_MODEL_API_KEY: 'k', META_MODEL_API_TIER: 'standard', META_SPARK_MODEL: 'muse-spark-test', META_MODEL_API_BASE_URL: 'https://meta.example' }, counting);
  const p = await runPipeline(
    [
      { filename: 'broken.pdf', bytes: Buffer.from('not a pdf') },
      { filename: 'photo.png', bytes: Buffer.from([0x89, 0x50]) },
    ],
    { corpus: 'upload', clients },
  );
  assert.equal(calls, 0);
  assert.deepEqual(p.documents.map((d) => d.status), ['failed', 'failed']);
  assert.ok(p.documents.every((d) => d.issues.length > 0 && d.fieldCount === 0));
  assert.equal(p.entries.length, 0);
  assert.equal(p.stages.find((s) => s.stage === 'normalize')!.engine, 'Nothing to normalize');
  assert.ok(p.stages.every((s) => !s.fallback || s.stage === 'extract'));
});
