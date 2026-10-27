// Shared agent contract. Both the deterministic parser extractor (tonight) and the
// Muse Spark Open extractor (Wednesday) emit CandidateField, so the stages are swappable.

import type { ParsedDocument } from '../types.ts';

export type FieldCategory = 'lab' | 'vital' | 'activity' | 'medication' | 'visit';

export type Extractor = 'parser' | 'muse-spark-open';

export interface CandidateField {
  id: string;
  documentId: string;
  /** Source name as stated in the document (row-level performing lab for portal exports). */
  sourceName: string | null;
  category: FieldCategory;
  /** Test / measure / medication name exactly as printed in the source. */
  label: string;
  value: string | null;
  unit: string | null;
  /** Normalized ISO date (yyyy-mm-dd or yyyy-mm) when the source date could be read. */
  date: string | null;
  /** Date text exactly as printed. */
  dateRaw: string | null;
  /** Reference range exactly as printed in the source; never computed, never judged. */
  referenceRangeText: string | null;
  /** Spans that back this field. Empty or ambiguous → Thursday's verification gate quarantines it. */
  spanIds: string[];
  extractor: Extractor;
  ambiguity: string | null;
}

export interface ExtractionStage {
  name: string;
  extractor: Extractor;
  extract(doc: ParsedDocument): Promise<CandidateField[]>;
}

export class StageNotImplementedError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.name = 'StageNotImplementedError';
    this.stage = stage;
  }
}
