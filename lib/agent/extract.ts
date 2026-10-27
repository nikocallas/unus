// Agent stage 1 — extract. Messy source text → candidate structured fields attached to span ids.

import { META_MODELS } from '../config/meta.ts';
import { extractWithParsers } from '../pipeline/parser-extract.ts';
import { StageNotImplementedError, type CandidateField, type ExtractionStage } from './types.ts';
import type { ParsedDocument } from '../types.ts';

export const museSparkOpenExtractor: ExtractionStage = {
  name: META_MODELS.extraction.label,
  extractor: 'muse-spark-open',
  async extract(_doc: ParsedDocument): Promise<CandidateField[]> {
    // TODO(Wed Oct 28): call META_MODELS.extraction.model on Baseten with the document's spans
    // (id + rawText), ask for test/value/unit/date/source per field, and require every field
    // to cite span ids from the input. Reject any cited span id that is not in doc.spans.
    throw new StageNotImplementedError('extract', 'Muse Spark Open extraction is not wired yet (Wednesday).');
  },
};

export const parserExtractor: ExtractionStage = {
  name: 'Deterministic parser extractor',
  extractor: 'parser',
  async extract(doc: ParsedDocument): Promise<CandidateField[]> {
    return extractWithParsers(doc);
  },
};

export interface ExtractionResult {
  documentId: string;
  fields: CandidateField[];
  usedFallback: boolean;
  /** Privacy-safe error category when the primary stage failed. */
  primaryError: string | null;
}

/** Try the model stage; on any failure, fall back to the deterministic parsers so a timeline still exists. */
export async function extractWithFallback(doc: ParsedDocument, primary: ExtractionStage = museSparkOpenExtractor): Promise<ExtractionResult> {
  try {
    return { documentId: doc.document.id, fields: await primary.extract(doc), usedFallback: false, primaryError: null };
  } catch (err) {
    const primaryError = err instanceof StageNotImplementedError ? 'not_implemented' : 'model_call_failed';
    return { documentId: doc.document.id, fields: await parserExtractor.extract(doc), usedFallback: true, primaryError };
  }
}
