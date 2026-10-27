// npm run demo:run — the full agent workflow on the synthetic corpus in one command:
// ingest → extract → normalize → verify → resolve → timeline → export.
// Uses Meta model stages when their env vars are set (see .env.example); otherwise every stage
// that could not run is reported as a labelled fallback.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildExport } from '../lib/export/bundle.ts';
import { generateCorpus } from '../lib/fixtures/corpus.ts';
import { clientsFromEnv, runPipeline } from '../lib/pipeline/run.ts';

const corpus = generateCorpus();
const passport = await runPipeline(
  corpus.files.map((f) => ({ filename: f.filename, bytes: f.bytes })),
  {
    corpus: 'sample',
    clients: clientsFromEnv(process.env),
    onEvent: (e) => {
      if (e.type !== 'stage-done') return;
      const r = e.report;
      console.log(`  ${r.stage.padEnd(9)} ${r.engine}${r.fallback ? `  [FALLBACK: ${r.fallbackReason}]` : ''}\n            ${r.detail} (${r.ms} ms)`);
    },
  },
);

const c = passport.coverage;
console.log(`\nCoverage: ${c.sources} sources, ${c.dateSpan.start} → ${c.dateSpan.end}, ${c.entries} entries, ${c.verifiedValues} verified values, ${c.heldForReview} held for review`);
console.log(`Entries found in several documents: ${c.multiDocumentEntries}; entries where sources differ: ${c.conflicts}`);
for (const e of passport.entries.filter((x) => x.conflict)) {
  console.log(`  differ: ${e.display} @ ${e.date} — ${e.values.map((v) => `${v.value} ${v.unit ?? ''} (${v.sourceName})`).join(' | ')}`);
}
console.log('Held for review:');
for (const q of passport.quarantined) console.log(`  ${q.label} = ${q.value ?? '∅'} — ${q.reasonLabel}`);

const outDir = join(import.meta.dirname, '..', 'out');
mkdirSync(outDir, { recursive: true });
const exported = buildExport(passport);
writeFileSync(join(outDir, 'unus-passport-sample.json'), `${JSON.stringify(exported, null, 2)}\n`);
console.log(`\nExport: ${exported.record.entry.length} verified resources, ${exported.heldForReview.items.length} held-for-review items → out/unus-passport-sample.json`);
