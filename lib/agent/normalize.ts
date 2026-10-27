// Agent stage 2a — normalize. Assigns each candidate field a concept so the same test from
// different sources lines up. Only the concept key and display name are assigned here; values,
// units and dates are never touched. Primary: Muse Spark. Fallback: a deterministic concept table.

import { normalizationPrompt, TRANSCRIBE_ONLY } from './prompts.ts';
import { parseJsonReply, type ChatClient } from '../models/clients.ts';
import type { CandidateField } from './types.ts';

export interface ConceptAssignment {
  conceptKey: string;
  display: string;
  method: 'muse-spark' | 'deterministic';
}

interface ConceptDef {
  key: string;
  display: string;
  names: string[];
}

// Deterministic fallback table: LOINC codes for the measures the parser fallback recognizes.
const CONCEPTS: ConceptDef[] = [
  { key: 'loinc:4548-4', display: 'Hemoglobin A1c', names: ['hemoglobin a1c', 'hgb a1c', 'hba1c', 'a1c'] },
  { key: 'loinc:13457-7', display: 'LDL cholesterol', names: ['ldl cholesterol', 'ldl chol', 'ldl'] },
  { key: 'loinc:2085-9', display: 'HDL cholesterol', names: ['hdl cholesterol', 'hdl chol', 'hdl'] },
  { key: 'loinc:2571-8', display: 'Triglycerides', names: ['triglycerides', 'triglyceride', 'trig'] },
  { key: 'loinc:3016-3', display: 'TSH', names: ['tsh', 'thyroid stimulating hormone'] },
  { key: 'loinc:2276-4', display: 'Ferritin', names: ['ferritin'] },
  { key: 'loinc:29463-7', display: 'Body weight', names: ['weight', 'body weight'] },
  { key: 'loinc:85354-9', display: 'Blood pressure', names: ['blood pressure', 'bp'] },
  { key: 'loinc:8867-4', display: 'Heart rate', names: ['heart rate', 'pulse'] },
  { key: 'loinc:8302-2', display: 'Body height', names: ['height', 'body height'] },
  { key: 'name:resting-heart-rate-monthly-average', display: 'Resting heart rate, monthly average (bpm)', names: ['resting_hr_bpm'] },
  { key: 'name:steps-daily-average', display: 'Steps, daily average', names: ['steps_daily_avg'] },
  { key: 'name:sleep-minutes-nightly-average', display: 'Sleep minutes, nightly average', names: ['sleep_min_nightly_avg'] },
  { key: 'name:days-with-device-data', display: 'Days with device data', names: ['days_with_data'] },
];

export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function deterministicConcept(field: CandidateField): ConceptAssignment {
  const byCode = field.sourceCode ? CONCEPTS.find((c) => c.key === field.sourceCode) : undefined;
  const name = field.label.trim().toLowerCase();
  const def = byCode ?? CONCEPTS.find((c) => c.names.includes(name));
  if (def) return { conceptKey: def.key, display: def.display, method: 'deterministic' };
  if (field.category === 'medication') return { conceptKey: `med:${slug(field.label)}`, display: field.label, method: 'deterministic' };
  if (field.category === 'visit') return { conceptKey: 'visit', display: 'Visit', method: 'deterministic' };
  return { conceptKey: `name:${slug(field.label)}`, display: field.label, method: 'deterministic' };
}

function itemKey(f: CandidateField): string {
  return [f.label, f.unit ?? '', f.category, f.sourceCode ?? ''].join('|');
}

/** Muse Spark concept assignment. Items the model omits or answers badly keep the deterministic concept. */
export async function modelConcepts(fields: CandidateField[], client: ChatClient): Promise<Map<string, ConceptAssignment>> {
  const items = new Map<string, CandidateField>();
  for (const f of fields) if (!items.has(itemKey(f))) items.set(itemKey(f), f);
  const reply = await client.complete([
    { role: 'system', content: TRANSCRIBE_ONLY },
    {
      role: 'user',
      content: normalizationPrompt([...items].map(([key, f]) => ({ key, label: f.label, unit: f.unit, category: f.category, code: f.sourceCode }))),
    },
  ]);
  const parsed = parseJsonReply(reply) as { concepts?: { key?: unknown; concept_key?: unknown; display?: unknown }[] };
  if (!Array.isArray(parsed.concepts)) throw new SyntaxError('Missing concepts array');
  const byItem = new Map<string, ConceptAssignment>();
  for (const c of parsed.concepts) {
    if (typeof c.key !== 'string' || typeof c.concept_key !== 'string' || typeof c.display !== 'string') continue;
    if (!/^(loinc|name|med):[a-z0-9.-]+$|^visit$/i.test(c.concept_key)) continue;
    byItem.set(c.key, { conceptKey: c.concept_key.toLowerCase(), display: c.display.slice(0, 120), method: 'muse-spark' });
  }
  return new Map(fields.map((f) => [f.id, byItem.get(itemKey(f)) ?? deterministicConcept(f)]));
}

export function deterministicConcepts(fields: CandidateField[]): Map<string, ConceptAssignment> {
  return new Map(fields.map((f) => [f.id, deterministicConcept(f)]));
}
