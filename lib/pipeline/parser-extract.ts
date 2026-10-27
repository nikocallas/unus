// Deterministic parser-only extraction: the fallback that keeps a timeline alive when a model
// call fails. It only copies what the source prints — no inference, no interpretation.

import type { CandidateField, FieldCategory } from '../agent/types.ts';
import type { CsvStructure, JsonStructure, ParsedDocument, PdfStructure, SectionedTextStructure } from '../types.ts';

export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return s;
  return null;
}

const VITAL_UNITS = new Set(['kg', 'lb', 'mmHg', 'bpm', 'cm', 'in']);

function fromPdf(doc: ParsedDocument, s: PdfStructure): CandidateField[] {
  const collectedLine = s.pages.flatMap((p) => p.lines).find((l) => /Collected:/i.test(l.text));
  const dateRaw = collectedLine?.text.match(/Collected:\s*(\S+)/i)?.[1] ?? null;
  const ambiguityBySpan = new Map(doc.spans.map((sp) => [sp.id, sp.ambiguity]));
  return s.tables.flatMap((table) => {
    const [testCol, valueCol, unitCol, rangeCol] = table.columns.map((c) => c.name);
    return table.rows.map((row, idx): CandidateField => ({
      id: `${row.spanId}#f${idx + 1}`,
      documentId: doc.document.id,
      sourceName: doc.document.sourceName,
      category: 'lab',
      label: row.cells[testCol!] ?? '',
      value: valueCol ? row.cells[valueCol] ?? null : null,
      unit: unitCol ? row.cells[unitCol] ?? null : null,
      date: normalizeDate(dateRaw),
      dateRaw,
      referenceRangeText: rangeCol ? row.cells[rangeCol] ?? null : null,
      sourceCode: null,
      spanIds: [row.spanId, ...(collectedLine ? [collectedLine.spanId] : [])],
      extractor: 'parser',
      ambiguity: ambiguityBySpan.get(row.spanId)?.reason ?? null,
    }));
  });
}

function fromCsv(doc: ParsedDocument, s: CsvStructure): CandidateField[] {
  const ambiguityBySpan = new Map(doc.spans.map((sp) => [sp.id, sp.ambiguity]));
  return s.rows
    .filter((r) => r.cells['Test Name'] !== undefined)
    .map((r): CandidateField => {
      const unit = r.cells['Units'] || null;
      const category: FieldCategory = unit && VITAL_UNITS.has(unit) ? 'vital' : 'lab';
      return {
        id: `${r.spanId}#f1`,
        documentId: doc.document.id,
        sourceName: r.cells['Performing Lab'] || doc.document.sourceName,
        category,
        label: r.cells['Test Name']!,
        value: r.cells['Result'] || null,
        unit,
        date: normalizeDate(r.cells['Result Date']),
        dateRaw: r.cells['Result Date'] ?? null,
        referenceRangeText: r.cells['Reference Range'] || null,
        sourceCode: r.cells['LOINC'] ? `loinc:${r.cells['LOINC']}` : null,
        spanIds: [r.spanId],
        extractor: 'parser',
        ambiguity: ambiguityBySpan.get(r.spanId)?.reason ?? null,
      };
    });
}

function fromJson(doc: ParsedDocument, s: JsonStructure): CandidateField[] {
  const fields: CandidateField[] = [];
  const byPointer = new Map(s.leaves.map((l) => [l.pointer, l]));
  const ambiguityBySpan = new Map(doc.spans.map((sp) => [sp.id, sp.ambiguity]));
  const records = (s.root as { records?: unknown[] } | null)?.records;
  if (!Array.isArray(records)) return fields;
  records.forEach((rec, idx) => {
    if (!rec || typeof rec !== 'object') return;
    const monthLeaf = byPointer.get(`/records/${idx}/month`);
    const dateRaw = typeof monthLeaf?.value === 'string' ? monthLeaf.value : null;
    for (const key of Object.keys(rec)) {
      if (key === 'month') continue;
      const leaf = byPointer.get(`/records/${idx}/${key}`);
      if (!leaf) continue;
      fields.push({
        id: `${leaf.spanId}#f1`,
        documentId: doc.document.id,
        sourceName: doc.document.sourceName,
        category: 'activity',
        label: key,
        value: leaf.value === null ? null : String(leaf.value),
        unit: null,
        date: normalizeDate(dateRaw),
        dateRaw,
        referenceRangeText: null,
        sourceCode: null,
        spanIds: monthLeaf ? [leaf.spanId, monthLeaf.spanId] : [leaf.spanId],
        extractor: 'parser',
        ambiguity: ambiguityBySpan.get(leaf.spanId)?.reason ?? null,
      });
    }
  });
  return fields;
}

function fromVisit(doc: ParsedDocument, s: SectionedTextStructure): CandidateField[] {
  const fields: CandidateField[] = [];
  const visit = s.sections.find((sec) => sec.heading === 'VISIT');
  const dateLine = visit?.lines.find((l) => /^Date:/i.test(l.text));
  const dateRaw = dateLine?.text.replace(/^Date:\s*/i, '').trim() ?? null;
  const dateSpan = dateLine ? [dateLine.spanId] : [];
  const base = { documentId: doc.document.id, sourceName: doc.document.sourceName, date: normalizeDate(dateRaw), dateRaw, referenceRangeText: null, sourceCode: null, extractor: 'parser' as const, ambiguity: null };

  for (const line of s.sections.find((sec) => sec.heading === 'VITALS')?.lines ?? []) {
    const m = /^([^:]+):\s*([\d./]+)\s*(.*)$/.exec(line.text);
    if (!m) continue;
    fields.push({ ...base, id: `${line.spanId}#f1`, category: 'vital', label: m[1]!.trim(), value: m[2]!, unit: m[3]!.trim() || null, spanIds: [line.spanId, ...dateSpan] });
  }
  for (const line of s.sections.find((sec) => sec.heading.startsWith('MEDICATIONS'))?.lines ?? []) {
    const [name, dosage] = line.text.split(/\s+-\s+/, 2);
    fields.push({ ...base, id: `${line.spanId}#f1`, category: 'medication', label: name!.trim(), value: dosage?.trim() ?? null, unit: null, spanIds: [line.spanId, ...dateSpan] });
  }
  const type = visit?.lines.find((l) => /^Type:/i.test(l.text));
  if (type) {
    fields.push({ ...base, id: `${type.spanId}#f1`, category: 'visit', label: 'Visit', value: type.text.replace(/^Type:\s*/i, ''), unit: null, spanIds: [type.spanId, ...dateSpan] });
  }
  return fields;
}

export function extractWithParsers(doc: ParsedDocument): CandidateField[] {
  const s = doc.structure;
  if (!s) return [];
  switch (s.kind) {
    case 'pdf_text': return fromPdf(doc, s);
    case 'csv_table': return fromCsv(doc, s);
    case 'json_tree': return fromJson(doc, s);
    case 'sectioned_text': return fromVisit(doc, s);
  }
}
