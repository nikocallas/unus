// Agent stage 2 — normalize + resolve. Candidate fields → FHIR-shaped resources; the same test
// from several sources becomes one timeline entry with every source listed. Conflicting values
// are kept side by side, never silently resolved.

import { META_MODELS } from '../config/meta.ts';
import { StageNotImplementedError, type CandidateField } from './types.ts';
import type { UnusResource } from './fhir.ts';

export interface ResolvedEntry {
  /** Stable key for the resolved concept, e.g. a LOINC code or normalized name. */
  conceptKey: string;
  display: string;
  date: string | null;
  resources: UnusResource[];
  /** All source values for this concept/date; more than one distinct value = a conflict shown side by side. */
  values: { value: string | null; unit: string | null; fieldId: string; sourceName: string | null }[];
  conflict: boolean;
}

export interface NormalizationStage {
  name: string;
  normalize(fields: CandidateField[]): Promise<UnusResource[]>;
  resolve(resources: UnusResource[]): Promise<ResolvedEntry[]>;
}

export const museSparkNormalizer: NormalizationStage = {
  name: META_MODELS.normalization.label,
  async normalize(_fields: CandidateField[]): Promise<UnusResource[]> {
    // TODO(Wed Oct 28): Muse Spark (Meta Model API, Standard tier) maps fields to FHIR-shaped
    // resources. It may only copy values from fields; provenance must list every input fieldId/spanId.
    throw new StageNotImplementedError('normalize', 'Muse Spark normalization is not wired yet (Wednesday).');
  },
  async resolve(_resources: UnusResource[]): Promise<ResolvedEntry[]> {
    // TODO(Thu Oct 29): entity resolution across documents (e.g. "HGB A1C" + "Hemoglobin A1c").
    // Conflicts set `conflict: true` and keep every value; never pick a winner.
    throw new StageNotImplementedError('resolve', 'Entity resolution is not wired yet (Thursday).');
  },
};
