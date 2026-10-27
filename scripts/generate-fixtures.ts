import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_SEED, generateCorpus, type Corpus } from '../lib/fixtures/corpus.ts';

export const CORPUS_DIR = join(import.meta.dirname, '..', 'fixtures', 'corpus');

export function writeCorpus(dir: string = CORPUS_DIR, seed: number = CORPUS_SEED): Corpus {
  const corpus = generateCorpus(seed);
  mkdirSync(dir, { recursive: true });
  for (const file of corpus.files) writeFileSync(join(dir, file.filename), file.bytes);
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(corpus.manifest, null, 2)}\n`);
  return corpus;
}

if (import.meta.main) {
  const corpus = writeCorpus();
  console.log(`Unus synthetic corpus (seed ${corpus.manifest.seed}) → ${CORPUS_DIR}`);
  for (const f of corpus.manifest.files) console.log(`  ${f.filename}  ${f.byteLength} B  sha256 ${f.sha256.slice(0, 16)}…`);
}
