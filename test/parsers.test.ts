import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';
import { FILENAMES, generateCorpus } from '../lib/fixtures/corpus.ts';
import { writePdf } from '../lib/fixtures/pdf-writer.ts';
import { ingestFile } from '../lib/ingest/index.ts';
import type { CsvStructure, JsonStructure, PdfStructure, SectionedTextStructure } from '../lib/types.ts';

const corpus = generateCorpus();
const file = (name: string) => {
  const f = corpus.files.find((x) => x.filename === name)!;
  return { filename: f.filename, bytes: f.bytes };
};

test('lab PDF: pages, lines, TJ kerning and compressed page 2 are extracted', () => {
  const doc = ingestFile(file(FILENAMES.labPdf));
  const s = doc.structure as PdfStructure;
  assert.equal(s.pages.length, 2);
  assert.equal(s.pages[0]!.lines[0]!.text, 'CASCADE SYNTHETIC LABORATORIES');
  assert.ok(s.pages[1]!.lines.some((l) => l.text === 'Ferritin result reported separately: 48 ng/mL'));
  assert.equal(doc.document.date, '2025-03-14');
});

test('lab PDF: results table keeps printed columns and flags the row without a value', () => {
  const doc = ingestFile(file(FILENAMES.labPdf));
  const table = (doc.structure as PdfStructure).tables[0]!;
  assert.deepEqual(table.columns.map((c) => c.name), ['Test', 'Result', 'Units', 'Reference range (as printed)']);
  assert.equal(table.rows.length, 6);
  assert.deepEqual(table.rows[0]!.cells, { Test: 'Hemoglobin A1c', Result: '5.6', Units: '%', 'Reference range (as printed)': '4.0-5.6' });
  const ferritin = table.rows.find((r) => r.cells.Test === 'Ferritin')!;
  assert.equal(ferritin.cells.Result, null);
  assert.equal(doc.spans.find((sp) => sp.id === ferritin.spanId)!.ambiguity?.reason, 'table_row_missing_value');
});

test('lab PDF: span ids are stable and carry page/line', () => {
  const a = ingestFile(file(FILENAMES.labPdf));
  const b = ingestFile(file(FILENAMES.labPdf));
  assert.deepEqual(a.spans.map((s) => s.id), b.spans.map((s) => s.id));
  assert.match(a.spans[0]!.id, /^doc_[0-9a-f]{12}:p1:l1$/);
});

test('PDF parser reports, not throws, on garbage and on unsupported filters', () => {
  const garbage = ingestFile({ filename: 'x.pdf', bytes: Buffer.from('not a pdf') });
  assert.equal(garbage.status, 'failed');
  const pdf = writePdf([{ items: [{ x: 72, y: 700, text: 'hello' }] }], 't').toString('latin1').replace('/Length', '/Filter /LZWDecode /Length');
  const lzw = ingestFile({ filename: 'y.pdf', bytes: Buffer.from(pdf, 'latin1') });
  assert.ok(lzw.issues.some((i) => i.code === 'pdf_stream_filter_unsupported'));
  assert.ok(deflateSync); // zlib available for FlateDecode
});

test('portal CSV: BOM, preamble, quoted comma, embedded newline, mixed dates', () => {
  const doc = ingestFile(file(FILENAMES.portalCsv));
  const s = doc.structure as CsvStructure;
  assert.equal(s.preamble.length, 4);
  assert.equal(s.columns[0], 'Result Date');
  assert.equal(s.rows.length, 13);
  const weight = s.rows.find((r) => r.cells['Test Name'] === 'Weight')!;
  assert.equal(weight.cells['Comment'], 'Entered at front desk, scale 2');
  assert.equal(weight.cells['Result Date'], '06/02/2026');
  const tsh = s.rows.find((r) => r.cells['Test Name'] === 'TSH')!;
  assert.equal(tsh.cells['Comment'], 'Specimen received\nafter courier delay');
  assert.ok(doc.issues.some((i) => i.code === 'csv_bom_stripped'));
  assert.equal(doc.document.sourceName, 'Northshore Synthetic Health');
  assert.equal(doc.status, 'parsed');
});

test('portal CSV: row and cell spans preserve raw text', () => {
  const doc = ingestFile(file(FILENAMES.portalCsv));
  const s = doc.structure as CsvStructure;
  const row = s.rows.find((r) => r.cells['Test Name'] === 'Weight')!;
  const rowSpan = doc.spans.find((sp) => sp.id === row.spanId)!;
  assert.ok(rowSpan.rawText.includes('"Entered at front desk, scale 2"'));
  assert.equal(doc.spans.find((sp) => sp.id === row.cellSpanIds['Result'])!.rawText, '72.9');
});

test('portal CSV: column-count mismatch becomes an ambiguous span', () => {
  const doc = ingestFile({ filename: 'm.csv', bytes: Buffer.from('a,b,c\n1,2,3\n4,5\n') });
  assert.equal(doc.spans.find((s) => s.id.endsWith(':r2'))!.ambiguity?.reason, 'row_column_mismatch');
  assert.equal(doc.status, 'partial');
});

test('wearable JSON: leaves keep pointer, line and exact raw text', () => {
  const doc = ingestFile(file(FILENAMES.wearableJson));
  const s = doc.structure as JsonStructure;
  const leaf = s.leaves.find((l) => l.pointer === '/records/0/month')!;
  assert.equal(leaf.value, '2024-01');
  assert.equal(doc.spans.find((sp) => sp.id === leaf.spanId)!.rawText, '"2024-01"');
  const text = doc.rawText.split('\n');
  assert.ok(text[leaf.line - 1]!.includes('"month": "2024-01"'));
  assert.equal(doc.document.sourceName, 'Synthetic Band S2');
});

test('wearable JSON: record with null month marks all its spans ambiguous', () => {
  const doc = ingestFile(file(FILENAMES.wearableJson));
  const ambiguous = doc.spans.filter((s) => s.ambiguity?.reason === 'record_missing_date');
  assert.equal(ambiguous.length, 5);
  assert.ok(ambiguous.every((s) => s.id.includes('/records/18/')));
});

test('wearable JSON: invalid JSON is reported, not thrown', () => {
  const doc = ingestFile({ filename: 'bad.json', bytes: Buffer.from('{"a": [1, 2,') });
  assert.equal(doc.status, 'failed');
  assert.equal(doc.issues[0]!.code, 'json_invalid');
});

test('visit summary: sections with line spans', () => {
  const doc = ingestFile(file(FILENAMES.visitSummary));
  const s = doc.structure as SectionedTextStructure;
  assert.deepEqual(
    s.sections.map((x) => x.heading),
    ['', 'PATIENT', 'VISIT', 'VITALS', 'MEDICATIONS (AS LISTED)', 'TESTS ORDERED'],
  );
  const weight = s.sections.find((x) => x.heading === 'VITALS')!.lines.find((l) => l.text.startsWith('Weight'))!;
  assert.equal(weight.line, 16);
  assert.equal(doc.spans.find((sp) => sp.id === weight.spanId)!.rawText, 'Weight: 72.4 kg');
  assert.equal(doc.document.date, '2026-06-02');
});

test('unknown file types fail cleanly', () => {
  const doc = ingestFile({ filename: 'scan.heic', bytes: Buffer.from([1, 2, 3]) });
  assert.equal(doc.status, 'failed');
  assert.equal(doc.issues[0]!.code, 'unsupported_file_type');
});
