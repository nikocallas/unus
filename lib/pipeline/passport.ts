// The serializable result of a run: what the UI renders and what export reads.

import type { ConceptSummary, TimelineEntry } from '../agent/resolve.ts';
import type { FieldCategory } from '../agent/types.ts';
import type { QuarantineReason } from '../agent/verify.ts';
import type { ParseStatus, SourceType, SpanAmbiguity, SpanLocator } from '../types.ts';

export type StageName = 'ingest' | 'extract' | 'normalize' | 'resolve' | 'verify' | 'timeline';

export interface StageReport {
  stage: StageName;
  engine: string;
  /** True when a Meta model stage could not run and the deterministic path was used instead. */
  fallback: boolean;
  /** Privacy-safe reason, e.g. "unavailable:missing_key:BASETEN_API_KEY". */
  fallbackReason: string | null;
  detail: string;
  ms: number;
}

export interface PassportDocument {
  id: string;
  filename: string;
  type: SourceType;
  sourceName: string | null;
  date: string | null;
  status: ParseStatus;
  spanCount: number;
  issues: string[];
}

export interface PassportSpan {
  id: string;
  documentId: string;
  locator: SpanLocator;
  rawText: string;
  ambiguity: SpanAmbiguity | null;
}

export interface PassportQuarantine {
  fieldId: string;
  label: string;
  value: string | null;
  unit: string | null;
  dateAsPrinted: string | null;
  documentId: string;
  spanIds: string[];
  reason: QuarantineReason;
  reasonLabel: string;
  detail: string;
}

export interface PassportCoverage {
  sources: number;
  dateSpan: { start: string | null; end: string | null };
  entries: number;
  verifiedValues: number;
  heldForReview: number;
  conflicts: number;
  multiDocumentEntries: number;
  byCategory: Record<FieldCategory, number>;
}

export interface Passport {
  runAt: string;
  corpus: 'sample' | 'upload';
  engines: Record<'extract' | 'normalize' | 'review', string>;
  stages: StageReport[];
  documents: PassportDocument[];
  /** All spans in document order, for source drill-down with surrounding context. */
  spans: PassportSpan[];
  entries: TimelineEntry[];
  concepts: ConceptSummary[];
  quarantined: PassportQuarantine[];
  coverage: PassportCoverage;
}
