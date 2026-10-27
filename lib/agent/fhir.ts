// FHIR-shaped resources Unus will publish (shape only — Wednesday fills these in).
// Every resource carries `unus.provenance`, so each published fact traces to its source spans.

export interface UnusProvenance {
  fieldIds: string[];
  spanIds: string[];
  sources: { documentId: string; sourceName: string | null }[];
}

interface Coding {
  system?: string;
  code?: string;
  display: string;
}

interface ResourceBase {
  id: string;
  unus: { provenance: UnusProvenance };
}

export interface Observation extends ResourceBase {
  resourceType: 'Observation';
  category: 'laboratory' | 'vital-signs' | 'activity';
  code: { text: string; coding: Coding[] };
  effectiveDateTime: string | null;
  valueQuantity?: { value: number; unit: string | null };
  valueString?: string;
  /** Exactly as printed in the source document. */
  referenceRange?: { text: string }[];
  performer?: { display: string }[];
}

export interface DiagnosticReport extends ResourceBase {
  resourceType: 'DiagnosticReport';
  code: { text: string };
  effectiveDateTime: string | null;
  issued: string | null;
  performer?: { display: string }[];
  result: { reference: string }[];
}

export interface MedicationStatement extends ResourceBase {
  resourceType: 'MedicationStatement';
  medication: { text: string };
  /** Dosage text exactly as listed in the source. */
  dosage?: { text: string }[];
  dateAsserted: string | null;
}

export interface Encounter extends ResourceBase {
  resourceType: 'Encounter';
  type: { text: string }[];
  period: { start: string | null };
  serviceProvider?: { display: string };
}

export type UnusResource = Observation | DiagnosticReport | MedicationStatement | Encounter;
