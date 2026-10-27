// Agent stage 1 — extract. Messy source text → candidate structured fields attached to span ids.
// Primary: Muse Spark Open on Baseten. Fallback: deterministic parsers (clearly labelled as such).

import { extractionPrompt, TRANSCRIBE_ONLY } from './prompts.ts';
import { errorCategory, parseJsonReply, type ChatClient } from '../models/clients.ts';
import { extractWithParsers, normalizeDate } from '../pipeline/parser-extract.ts';
import type { CandidateField, Extractor, FieldCategory } from './types.ts';
import type { ParsedDocument } from '../types.ts';

const CATEGORIES = new Set<FieldCategory>(['lab', 'vital', 'activity', 'medication', 'visit']);
const SPANS_PER_CALL = 160;

function str(v: unknown): string | null {
  if (typeof v === 'number') return String(v);
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/** Spans worth sending: CSV cell spans duplicate their row span, so only rows/preamble go to the model. */
function promptSpans(doc: ParsedDocument): { id: string; text: string }[] {
  return doc.spans.filter((s) => s.locator.column === undefined).map((s) => ({ id: s.id, text: s.rawText.replace(/\r?\n/g, ' ⏎ ') }));
}

export async function extractWithModel(doc: ParsedDocument, client: ChatClient): Promise<CandidateField[]> {
  const spans = promptSpans(doc);
  const known = new Set(doc.spans.map((s) => s.id));
  const ambiguity = new Map(doc.spans.map((s) => [s.id, s.ambiguity?.reason ?? null]));
  const fields: CandidateField[] = [];
  for (let start = 0; start < spans.length; start += SPANS_PER_CALL) {
    const chunk = spans.slice(start, start + SPANS_PER_CALL);
    const reply = await client.complete(
      [
        { role: 'system', content: TRANSCRIBE_ONLY },
        { role: 'user', content: extractionPrompt(doc.document.type, doc.document.sourceName, chunk) },
      ],
      { maxTokens: 8192 },
    );
    const parsed = parseJsonReply(reply) as { fields?: unknown };
    if (!Array.isArray(parsed.fields)) throw new SyntaxError('Missing fields array');
    for (const raw of parsed.fields as Record<string, unknown>[]) {
      const label = str(raw.label);
      if (!label) continue;
      const cited = Array.isArray(raw.span_ids) ? raw.span_ids.filter((x): x is string => typeof x === 'string') : [];
      // A cited id that is not a real span is dropped, so the verification gate sees the field as untraceable.
      const spanIds = cited.filter((id) => known.has(id));
      const dateRaw = str(raw.date_text);
      const category = CATEGORIES.has(raw.category as FieldCategory) ? (raw.category as FieldCategory) : 'lab';
      fields.push({
        id: `${doc.document.id}#m${fields.length + 1}`,
        documentId: doc.document.id,
        sourceName: doc.document.sourceName,
        category,
        label,
        value: str(raw.value),
        unit: str(raw.unit),
        date: normalizeDate(dateRaw),
        dateRaw,
        referenceRangeText: str(raw.reference_range_text),
        sourceCode: null,
        spanIds,
        extractor: 'muse-spark-open',
        ambiguity: spanIds.map((id) => ambiguity.get(id)).find((a) => a) ?? (cited.length !== spanIds.length ? 'cited_unknown_span' : null),
      });
    }
  }
  return fields;
}

export interface ExtractionResult {
  documentId: string;
  fields: CandidateField[];
  extractor: Extractor;
  usedFallback: boolean;
  /** Privacy-safe error category when the model stage could not run or failed. */
  primaryError: string | null;
}

/** Try Muse Spark Open; on any failure (or no client), fall back to the deterministic parsers. */
export async function extractDocument(doc: ParsedDocument, client: ChatClient | null, clientError: string | null): Promise<ExtractionResult> {
  if (client) {
    try {
      return { documentId: doc.document.id, fields: await extractWithModel(doc, client), extractor: 'muse-spark-open', usedFallback: false, primaryError: null };
    } catch (err) {
      return { documentId: doc.document.id, fields: extractWithParsers(doc), extractor: 'parser', usedFallback: true, primaryError: errorCategory(err) };
    }
  }
  return { documentId: doc.document.id, fields: extractWithParsers(doc), extractor: 'parser', usedFallback: true, primaryError: clientError };
}
