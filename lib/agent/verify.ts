// Verification gate (Thursday). Every published field must trace to a clean source span,
// or it is quarantined and shown as "held for review". Types only for now.

import type { CandidateField } from './types.ts';

export type QuarantineReason = 'no_source_span' | 'ambiguous_span' | 'span_not_found' | 'value_not_in_span';

export interface VerificationResult {
  published: CandidateField[];
  quarantined: { field: CandidateField; reason: QuarantineReason }[];
}

// TODO(Thu Oct 29): deterministic checker (span exists, span unambiguous, value text appears in
// span rawText) followed by a Muse Spark review pass. Never publish a field that fails the checker.
