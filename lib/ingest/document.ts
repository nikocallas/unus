import { createHash } from 'node:crypto';
import type { InputFile, ParseIssue, ParsedSpan, ParseStatus, SourceDocument, SourceType } from '../types.ts';

export function describeDocument(file: InputFile, type: SourceType): SourceDocument {
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');
  return {
    id: `doc_${sha256.slice(0, 12)}`,
    type,
    filename: file.filename,
    sourceName: null,
    date: null,
    byteLength: file.bytes.length,
    sha256,
  };
}

export function statusFor(issues: ParseIssue[], spans: ParsedSpan[]): ParseStatus {
  if (issues.some((i) => i.severity === 'error') && spans.length === 0) return 'failed';
  if (issues.length > 0 || spans.some((s) => s.ambiguity !== null)) return 'partial';
  return 'parsed';
}

/** Decode UTF-8, stripping a BOM if present. */
export function decodeText(bytes: Uint8Array): { text: string; hadBom: boolean } {
  const hadBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder('utf-8').decode(hadBom ? bytes.subarray(3) : bytes);
  return { text, hadBom };
}

export function isoDateFrom(text: string): string | null {
  return text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;
}
