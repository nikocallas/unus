// Visit summary parsing: a title line, then sections introduced by ALL-CAPS headings, with line spans.

import { decodeText, describeDocument, isoDateFrom, statusFor } from './document.ts';
import type { InputFile, ParsedDocument, ParsedSpan, ParseIssue, SectionedTextStructure, TextLine, TextSection } from '../types.ts';

function isHeading(text: string): boolean {
  return /^[A-Z][A-Z0-9 ()&/-]{2,}$/.test(text.trim()) && !/^SYNTHETIC TEST DATA/.test(text);
}

export function parseVisitText(file: InputFile): ParsedDocument {
  const document = describeDocument(file, 'visit_summary');
  const issues: ParseIssue[] = [];
  const spans: ParsedSpan[] = [];
  const { text } = decodeText(file.bytes);

  let title: TextLine | null = null;
  const preface: TextLine[] = [];
  const sections: TextSection[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    if (raw.trim().length === 0) return;
    const spanId = `${document.id}:l${line}`;
    spans.push({ id: spanId, documentId: document.id, locator: { line }, rawText: raw, ambiguity: null });
    const entry: TextLine = { line, text: raw, spanId };
    if (!title) { title = entry; return; }
    if (isHeading(raw)) { sections.push({ heading: raw.trim(), headingLine: line, lines: [] }); return; }
    const current = sections[sections.length - 1];
    if (current) current.lines.push(entry);
    else preface.push(entry);
  });

  if (sections.length === 0) issues.push({ severity: 'warning', code: 'text_no_sections', message: 'No section headings found.' });

  const firstLine: TextLine | null = title;
  document.sourceName = firstLine ? (firstLine as TextLine).text.replace(/\s+-\s+VISIT SUMMARY$/i, '') : null;
  const visitDate = sections.find((s) => s.heading === 'VISIT')?.lines.find((l) => /^Date:/i.test(l.text));
  document.date = visitDate ? isoDateFrom(visitDate.text) : null;

  // Lines between the title and the first heading (e.g. the synthetic notice) form an unnamed preface section.
  const allSections = preface.length > 0 ? [{ heading: '', headingLine: preface[0]!.line, lines: preface }, ...sections] : sections;
  const structure: SectionedTextStructure = { kind: 'sectioned_text', title: firstLine, sections: allSections };
  return { document, status: statusFor(issues, spans), rawText: text, structure, spans, issues };
}
