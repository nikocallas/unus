// npm run demo:parse — generate the synthetic corpus, read it back from disk, run the pipeline
// with the deterministic parsers (Phase 1, no model calls), and print what parsed and what did not.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeCorpus, CORPUS_DIR } from './generate-fixtures.ts';
import { ingestFiles } from '../lib/ingest/index.ts';
import { extractWithParsers } from '../lib/pipeline/parser-extract.ts';
import { buildTimeline } from '../lib/pipeline/timeline.ts';
import { checkPlantedCases } from '../lib/fixtures/check.ts';

const corpus = writeCorpus();
const files = corpus.manifest.files.map((f) => ({ filename: f.filename, bytes: readFileSync(join(CORPUS_DIR, f.filename)) }));
const documents = ingestFiles(files);
const extraction = documents.filter((d) => d.status !== 'failed').map((d) => ({ documentId: d.document.id, fields: extractWithParsers(d) }));
const run = { documents, extraction, timeline: buildTimeline(documents, extraction.flatMap((e) => e.fields)) };

console.log(`\nUnus — parse run on synthetic corpus (seed ${corpus.manifest.seed})\n`);
console.log('Documents');
for (const d of run.documents) {
  const ambiguous = d.spans.filter((s) => s.ambiguity).length;
  console.log(
    `  [${d.status.padEnd(7)}] ${d.document.filename}\n` +
      `            type=${d.document.type} source="${d.document.sourceName ?? '—'}" date=${d.document.date ?? '—'} spans=${d.spans.length} ambiguous=${ambiguous} issues=${d.issues.length}`,
  );
}

console.log('\nExtraction');
for (const e of run.extraction) {
  const doc = run.documents.find((d) => d.document.id === e.documentId)!;
  console.log(`  ${doc.document.filename}: ${e.fields.length} fields via deterministic parsers`);
}

const { coverage } = run.timeline;
console.log('\nParser-only timeline (coverage)');
console.log(`  sources=${coverage.sources.length} span=${coverage.dateSpan.start} → ${coverage.dateSpan.end} entries=${coverage.counts.total} dated=${coverage.counts.dated} undated=${coverage.counts.undated}`);
console.log(`  by category: ${Object.entries(coverage.counts.byCategory).map(([k, v]) => `${k}=${v}`).join(' ')}`);

const checks = checkPlantedCases(corpus.manifest, run.documents, run.timeline.entries);
console.log('\nPlanted cases (needed Thu)');
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.id} (${c.kind}) — ${c.detail}`);

const plantedSpans = new Set(checks.flatMap((c) => c.spanIds));
console.log('\nDid not parse cleanly');
const notClean: string[] = [];
for (const d of run.documents) {
  for (const i of d.issues) notClean.push(`  ${d.document.filename}: [${i.severity}] ${i.code} — ${i.message}`);
  for (const s of d.spans.filter((sp) => sp.ambiguity)) {
    const tag = plantedSpans.has(s.id) ? ' (planted, expected)' : '';
    notClean.push(`  ${d.document.filename}: ${s.id} ${s.ambiguity!.reason}${tag} — ${JSON.stringify(s.rawText)}`);
  }
}
console.log(notClean.length > 0 ? notClean.join('\n') : '  (nothing)');

const failed = run.documents.filter((d) => d.status === 'failed').length + checks.filter((c) => !c.ok).length;
console.log(failed === 0 ? '\nResult: all documents parsed; all planted cases present.\n' : `\nResult: ${failed} problem(s) — see above.\n`);
process.exitCode = failed === 0 ? 0 : 1;
