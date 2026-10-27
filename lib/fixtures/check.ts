// Confirms the deliberately planted corpus cases survive ingest + parser extraction,
// so Thursday's resolution, conflict display and quarantine have real inputs.

import type { CandidateField } from '../agent/types.ts';
import type { ParsedDocument } from '../types.ts';
import type { CorpusManifest, PlantedCase } from './corpus.ts';

export interface PlantedCheck {
  id: string;
  kind: PlantedCase['kind'];
  ok: boolean;
  detail: string;
  spanIds: string[];
}

export function checkPlantedCases(manifest: CorpusManifest, docs: ParsedDocument[], fields: CandidateField[]): PlantedCheck[] {
  const docIdByFile = new Map(docs.map((d) => [d.document.filename, d.document.id]));
  return manifest.plantedCases.map((pc) => {
    const matches = pc.occurrences.map((occ) =>
      fields.find(
        (f) =>
          f.documentId === docIdByFile.get(occ.filename) &&
          f.label === occ.label &&
          (pc.kind === 'no_clean_span'
            ? f.ambiguity !== null
            : f.date === occ.date && f.value === occ.value && f.unit === occ.unit),
      ),
    );
    const found = matches.filter((m): m is CandidateField => m !== undefined);
    const ok = found.length === pc.occurrences.length;
    const detail = ok
      ? found.map((f) => `${f.label}=${f.value ?? '∅'}${f.unit ? ` ${f.unit}` : ''} @ ${f.date ?? 'no date'}${f.ambiguity ? ` [${f.ambiguity}]` : ''}`).join(' | ')
      : `found ${found.length}/${pc.occurrences.length} occurrences`;
    return { id: pc.id, kind: pc.kind, ok, detail, spanIds: found.flatMap((f) => f.spanIds) };
  });
}
