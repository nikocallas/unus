// Agent stage 2b — resolve. Published fields with the same concept and date become one timeline
// entry listing every source. Different values stay side by side (conflict: true); nothing is
// averaged, converted or chosen.

import type { ConceptAssignment } from './normalize.ts';
import type { CandidateField, Extractor, FieldCategory } from './types.ts';

export interface TimelineValue {
  fieldId: string;
  value: string;
  unit: string | null;
  labelAsPrinted: string;
  dateAsPrinted: string | null;
  referenceRangeText: string | null;
  sourceName: string | null;
  documentId: string;
  spanIds: string[];
  extractor: Extractor;
}

export interface TimelineEntry {
  id: string;
  conceptKey: string;
  display: string;
  category: FieldCategory;
  date: string;
  values: TimelineValue[];
  sources: string[];
  /** Distinct documents this entry was found in. */
  documentIds: string[];
  /** More than one distinct value/unit among sources — shown side by side, never resolved. */
  conflict: boolean;
}

export interface ConceptSummary {
  conceptKey: string;
  display: string;
  category: FieldCategory;
  sources: string[];
  labelsAsPrinted: string[];
  entryCount: number;
}

/** The same source printed in different case ("CASCADE …" vs "Cascade …") counts once; each value keeps its printed name. */
function hasSource(list: string[], name: string): boolean {
  return list.some((s) => s.toLowerCase() === name.toLowerCase());
}

export function resolveEntries(published: CandidateField[], concepts: Map<string, ConceptAssignment>, filenames: Map<string, string>): { entries: TimelineEntry[]; concepts: ConceptSummary[] } {
  const groups = new Map<string, TimelineEntry>();
  for (const f of published) {
    const concept = concepts.get(f.id);
    if (!concept || !f.date || f.value === null) continue;
    const key = `${concept.conceptKey}@${f.date}`;
    const source = f.sourceName ?? filenames.get(f.documentId) ?? f.documentId;
    let entry = groups.get(key);
    if (!entry) {
      entry = { id: key, conceptKey: concept.conceptKey, display: concept.display, category: f.category, date: f.date, values: [], sources: [], documentIds: [], conflict: false };
      groups.set(key, entry);
    }
    entry.values.push({
      fieldId: f.id,
      value: f.value,
      unit: f.unit,
      labelAsPrinted: f.label,
      dateAsPrinted: f.dateRaw,
      referenceRangeText: f.referenceRangeText,
      sourceName: source,
      documentId: f.documentId,
      spanIds: f.spanIds,
      extractor: f.extractor,
    });
    if (!hasSource(entry.sources, source)) entry.sources.push(source);
    if (!entry.documentIds.includes(f.documentId)) entry.documentIds.push(f.documentId);
  }
  const entries = [...groups.values()].map((e) => ({
    ...e,
    conflict: new Set(e.values.map((v) => `${v.value.trim()}|${(v.unit ?? '').trim().toLowerCase()}`)).size > 1,
  }));
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.display.localeCompare(b.display));

  const byConcept = new Map<string, ConceptSummary>();
  for (const e of entries) {
    const c = byConcept.get(e.conceptKey) ?? { conceptKey: e.conceptKey, display: e.display, category: e.category, sources: [], labelsAsPrinted: [], entryCount: 0 };
    c.entryCount++;
    for (const s of e.sources) if (!hasSource(c.sources, s)) c.sources.push(s);
    for (const v of e.values) if (!c.labelsAsPrinted.includes(v.labelAsPrinted)) c.labelsAsPrinted.push(v.labelAsPrinted);
    byConcept.set(e.conceptKey, c);
  }
  return { entries, concepts: [...byConcept.values()] };
}
