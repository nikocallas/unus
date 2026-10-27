import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORPUS_SEED, generateCorpus } from '../lib/fixtures/corpus.ts';
import { ingestFile } from '../lib/ingest/index.ts';

test('corpus is byte-for-byte deterministic for a seed', () => {
  const a = generateCorpus(CORPUS_SEED);
  const b = generateCorpus(CORPUS_SEED);
  assert.deepEqual(a.manifest, b.manifest);
  a.files.forEach((f, i) => assert.ok(f.bytes.equals(b.files[i]!.bytes), f.filename));
});

test('a different seed changes the seeded values', () => {
  const a = generateCorpus(CORPUS_SEED);
  const b = generateCorpus(CORPUS_SEED + 1);
  assert.notEqual(a.manifest.files[2]!.sha256, b.manifest.files[2]!.sha256);
});

test('corpus has the four source types spanning 2-3 years', () => {
  const { files, manifest } = generateCorpus();
  assert.deepEqual(files.map((f) => f.type).sort(), ['lab_pdf', 'portal_csv', 'visit_summary', 'wearable_json']);
  assert.equal(manifest.dateSpan.start, '2024-01');
  assert.equal(manifest.dateSpan.end, '2026-09');
});

test('every file is marked synthetic and carries no real-looking identifiers', () => {
  for (const f of generateCorpus().files) {
    // Check extracted text, not raw bytes: compressed PDF streams can contain any byte sequence.
    const text = ingestFile(f).rawText;
    assert.match(text, /SYNTHETIC TEST DATA/, f.filename);
    assert.doesNotMatch(text, /\b\d{3}-\d{2}-\d{4}\b/, `${f.filename} contains an SSN-shaped value`);
    assert.doesNotMatch(text, /DOB|date of birth/i, `${f.filename} contains a date of birth`);
  }
});

test('manifest plants every case Thursday needs', () => {
  const kinds = generateCorpus().manifest.plantedCases.map((c) => c.kind);
  assert.ok(kinds.includes('same_test_two_labs'));
  assert.ok(kinds.includes('conflicting_value'));
  assert.ok(kinds.includes('no_clean_span'));
});
