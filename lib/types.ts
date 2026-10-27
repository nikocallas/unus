// Ingest contract. Wednesday's extraction stage consumes exactly these shapes and
// attaches candidate fields to span ids, so spans must never be lost here.

export type SourceType = 'lab_pdf' | 'portal_csv' | 'wearable_json' | 'visit_summary';

export interface SourceDocument {
  /** Stable: derived from the file bytes, so the same file always gets the same id. */
  id: string;
  type: SourceType;
  filename: string;
  /** Source name as stated in the document, when the document states one. */
  sourceName: string | null;
  /** Document date as stated in the document (ISO yyyy-mm-dd), when stated. */
  date: string | null;
  byteLength: number;
  sha256: string;
}

export interface SpanLocator {
  page?: number;
  line?: number;
  row?: number;
  column?: string;
  /** RFC 6901 JSON pointer for wearable JSON. */
  pointer?: string;
}

export type AmbiguityReason =
  | 'table_row_missing_value'
  | 'record_missing_date'
  | 'row_column_mismatch';

export interface SpanAmbiguity {
  reason: AmbiguityReason;
  detail: string;
}

export interface ParsedSpan {
  id: string;
  documentId: string;
  locator: SpanLocator;
  /** Text exactly as it appears in the source (for PDFs: as extracted from the content stream). */
  rawText: string;
  /** Non-null when this span cannot cleanly back a field; Thursday's verification gate quarantines these. */
  ambiguity: SpanAmbiguity | null;
}

export interface ParseIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  spanId?: string;
}

export type ParseStatus = 'parsed' | 'partial' | 'failed';

export interface TextLine {
  line: number;
  text: string;
  spanId: string;
}

export interface PdfSegment {
  x: number;
  text: string;
}

export interface PdfLine extends TextLine {
  y: number;
  segments: PdfSegment[];
}

export interface PdfTableRow {
  page: number;
  line: number;
  spanId: string;
  /** Column name (as printed in the header) → cell text, or null when the row has no cell under that column. */
  cells: Record<string, string | null>;
}

export interface PdfTable {
  page: number;
  headerLine: number;
  columns: { name: string; x: number }[];
  rows: PdfTableRow[];
}

export interface PdfStructure {
  kind: 'pdf_text';
  pages: { page: number; lines: PdfLine[] }[];
  tables: PdfTable[];
}

export interface CsvRow {
  /** 1-based data row number (header excluded). */
  row: number;
  /** 1-based physical line where the record starts. */
  line: number;
  spanId: string;
  cells: Record<string, string>;
  cellSpanIds: Record<string, string>;
}

export interface CsvStructure {
  kind: 'csv_table';
  preamble: TextLine[];
  columns: string[];
  rows: CsvRow[];
}

export interface JsonLeaf {
  pointer: string;
  line: number;
  spanId: string;
  value: string | number | boolean | null;
}

export interface JsonStructure {
  kind: 'json_tree';
  root: unknown;
  leaves: JsonLeaf[];
}

export interface TextSection {
  heading: string;
  headingLine: number;
  lines: TextLine[];
}

export interface SectionedTextStructure {
  kind: 'sectioned_text';
  title: TextLine | null;
  sections: TextSection[];
}

export type ParsedStructure = PdfStructure | CsvStructure | JsonStructure | SectionedTextStructure;

export interface ParsedDocument {
  document: SourceDocument;
  status: ParseStatus;
  rawText: string;
  structure: ParsedStructure | null;
  spans: ParsedSpan[];
  issues: ParseIssue[];
}

export interface InputFile {
  filename: string;
  bytes: Uint8Array;
}
