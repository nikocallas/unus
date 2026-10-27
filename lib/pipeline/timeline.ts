// Parser-only timeline: chronological list of candidate fields plus descriptive coverage stats
// (sources, date span, counts). Nothing here is resolved, verified or judged — that is Thu/Fri.

import type { CandidateField, FieldCategory } from '../agent/types.ts';
import type { ParsedDocument } from '../types.ts';

export interface Coverage {
  sources: { documentId: string; filename: string; sourceName: string | null; type: string }[];
  dateSpan: { start: string | null; end: string | null };
  counts: { total: number; dated: number; undated: number; byCategory: Record<FieldCategory, number> };
}

export interface ParserOnlyTimeline {
  entries: CandidateField[];
  coverage: Coverage;
}

export function buildTimeline(docs: ParsedDocument[], fields: CandidateField[]): ParserOnlyTimeline {
  const entries = [...fields].sort((a, b) => {
    if (a.date === b.date) return a.id.localeCompare(b.id);
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date.localeCompare(b.date);
  });
  const dated = entries.filter((e) => e.date !== null);
  const byCategory: Record<FieldCategory, number> = { lab: 0, vital: 0, activity: 0, medication: 0, visit: 0 };
  for (const e of entries) byCategory[e.category]++;
  return {
    entries,
    coverage: {
      sources: docs.map((d) => ({ documentId: d.document.id, filename: d.document.filename, sourceName: d.document.sourceName, type: d.document.type })),
      dateSpan: { start: dated[0]?.date ?? null, end: dated[dated.length - 1]?.date ?? null },
      counts: { total: entries.length, dated: dated.length, undated: entries.length - dated.length, byCategory },
    },
  };
}
