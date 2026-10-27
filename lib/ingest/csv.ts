// RFC 4180-style portal export parsing with the original column names preserved.
// Handles a BOM, CRLF, quoted commas/quotes/newlines, '#' preamble lines and trailing blank lines.

import { decodeText, describeDocument, isoDateFrom, statusFor } from './document.ts';
import type { CsvRow, CsvStructure, InputFile, ParsedDocument, ParsedSpan, ParseIssue, TextLine } from '../types.ts';

interface RawRecord {
  cells: string[];
  /** 1-based physical line where the record starts. */
  line: number;
  raw: string;
}

function readRecords(text: string, startOffset: number, startLine: number): RawRecord[] {
  const records: RawRecord[] = [];
  let i = startOffset;
  let line = startLine;
  while (i < text.length) {
    const recStart = i;
    const recLine = line;
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    let done = false;
    while (i < text.length && !done) {
      const c = text[i]!;
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        if (c === '"') { quoted = false; i++; continue; }
        if (c === '\n') line++;
        cell += c;
        i++;
        continue;
      }
      if (c === '"' && cell.length === 0) { quoted = true; i++; continue; }
      if (c === ',') { cells.push(cell); cell = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        done = true;
        i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
        line++;
        continue;
      }
      cell += c;
      i++;
    }
    cells.push(cell);
    const raw = text.slice(recStart, i).replace(/\r?\n$/, '');
    if (raw.trim().length > 0) records.push({ cells, line: recLine, raw });
  }
  return records;
}

export function parseCsv(file: InputFile): ParsedDocument {
  const document = describeDocument(file, 'portal_csv');
  const issues: ParseIssue[] = [];
  const spans: ParsedSpan[] = [];
  const { text, hadBom } = decodeText(file.bytes);
  if (hadBom) issues.push({ severity: 'warning', code: 'csv_bom_stripped', message: 'UTF-8 byte-order mark removed before parsing.' });

  // Preamble: leading lines starting with '#', kept as spans because they carry source metadata.
  const preamble: TextLine[] = [];
  let offset = 0;
  let line = 1;
  while (offset < text.length && text[offset] === '#') {
    const end = text.indexOf('\n', offset);
    const stop = end < 0 ? text.length : end + 1;
    const lineText = text.slice(offset, stop).replace(/\r?\n$/, '');
    const spanId = `${document.id}:l${line}`;
    spans.push({ id: spanId, documentId: document.id, locator: { line }, rawText: lineText, ambiguity: null });
    preamble.push({ line, text: lineText, spanId });
    offset = stop;
    line++;
  }

  const records = readRecords(text, offset, line);
  const header = records.shift();
  if (!header) {
    issues.push({ severity: 'error', code: 'csv_no_header', message: 'No header row found.' });
    return { document, status: 'failed', rawText: text, structure: null, spans, issues };
  }
  const columns = header.cells.map((c) => c.trim());
  const seen = new Set<string>();
  for (const col of columns) {
    if (seen.has(col)) issues.push({ severity: 'warning', code: 'csv_duplicate_column', message: `Duplicate column "${col}"; later cells overwrite earlier ones.` });
    seen.add(col);
  }

  const rows: CsvRow[] = records.map((rec, idx) => {
    const row = idx + 1;
    const spanId = `${document.id}:r${row}`;
    const mismatch = rec.cells.length !== columns.length;
    spans.push({
      id: spanId,
      documentId: document.id,
      locator: { row, line: rec.line },
      rawText: rec.raw,
      ambiguity: mismatch
        ? { reason: 'row_column_mismatch', detail: `Row has ${rec.cells.length} cells; header has ${columns.length}.` }
        : null,
    });
    if (mismatch) {
      issues.push({ severity: 'warning', code: 'csv_column_mismatch', message: `Row ${row} has ${rec.cells.length} cells; header has ${columns.length}.`, spanId });
    }
    const cells: Record<string, string> = {};
    const cellSpanIds: Record<string, string> = {};
    columns.forEach((col, c) => {
      const value = rec.cells[c];
      if (value === undefined) return;
      const cellSpanId = `${spanId}:c${c + 1}`;
      cells[col] = value;
      cellSpanIds[col] = cellSpanId;
      spans.push({ id: cellSpanId, documentId: document.id, locator: { row, line: rec.line, column: col }, rawText: value, ambiguity: null });
    });
    return { row, line: rec.line, spanId, cells, cellSpanIds };
  });

  const structure: CsvStructure = { kind: 'csv_table', preamble, columns, rows };
  const title = preamble[0]?.text.replace(/^#\s*/, '') ?? null;
  document.sourceName = title ? title.replace(/\s+-\s+Patient Portal Export$/i, '') : null;
  const exported = preamble.find((p) => /Exported:/i.test(p.text));
  document.date = exported ? isoDateFrom(exported.text) : null;
  return { document, status: statusFor(issues.filter((i) => i.code !== 'csv_bom_stripped'), spans), rawText: text, structure, spans, issues };
}
