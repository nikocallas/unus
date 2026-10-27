// Ingest entry point. Never throws: every failure becomes a ParseIssue on a 'failed' document.

import { parseCsv } from './csv.ts';
import { describeDocument } from './document.ts';
import { parseJson } from './json.ts';
import { parsePdf } from './pdf.ts';
import { parseVisitText } from './text.ts';
import type { InputFile, ParsedDocument, SourceType } from '../types.ts';

export function detectSourceType(file: InputFile): SourceType | null {
  const name = file.filename.toLowerCase();
  const head = Buffer.from(file.bytes.subarray(0, 8)).toString('latin1');
  if (head.startsWith('%PDF-') || name.endsWith('.pdf')) return 'lab_pdf';
  if (name.endsWith('.csv')) return 'portal_csv';
  if (name.endsWith('.json')) return 'wearable_json';
  if (name.endsWith('.txt') || name.endsWith('.md')) return 'visit_summary';
  return null;
}

const PARSERS: Record<SourceType, (file: InputFile) => ParsedDocument> = {
  lab_pdf: parsePdf,
  portal_csv: parseCsv,
  wearable_json: parseJson,
  visit_summary: parseVisitText,
};

export function ingestFile(file: InputFile): ParsedDocument {
  const type = detectSourceType(file);
  if (!type) {
    const document = describeDocument(file, 'visit_summary');
    return {
      document,
      status: 'failed',
      rawText: '',
      structure: null,
      spans: [],
      issues: [{ severity: 'error', code: 'unsupported_file_type', message: `Unsupported file type: ${file.filename}` }],
    };
  }
  try {
    return PARSERS[type](file);
  } catch (err) {
    const document = describeDocument(file, type);
    return {
      document,
      status: 'failed',
      rawText: '',
      structure: null,
      spans: [],
      issues: [{ severity: 'error', code: 'parser_crashed', message: err instanceof Error ? err.message : 'Parser failed.' }],
    };
  }
}

export function ingestFiles(files: InputFile[]): ParsedDocument[] {
  return files.map(ingestFile);
}
