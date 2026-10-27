// Verification gate. A field is published only if it traces to clean source spans that literally
// contain its label, value and date. Everything else is quarantined ("held for review") and never
// appears in the timeline or the verified export. The Muse Spark review pass can only quarantine
// more fields — it can never publish a field the deterministic checker rejected.

import { reviewPrompt, TRANSCRIBE_ONLY } from './prompts.ts';
import { parseJsonReply, type ChatClient } from '../models/clients.ts';
import type { CandidateField } from './types.ts';
import type { ParsedSpan } from '../types.ts';

export type QuarantineReason =
  | 'no_source_span'
  | 'span_not_found'
  | 'ambiguous_span'
  | 'no_value_in_source'
  | 'value_not_in_span'
  | 'label_not_in_span'
  | 'no_date_in_source'
  | 'date_not_in_span'
  | 'review_flagged';

export const QUARANTINE_LABELS: Record<QuarantineReason, string> = {
  no_source_span: 'No source span found',
  span_not_found: 'Cited span does not exist',
  ambiguous_span: 'Source span is ambiguous',
  no_value_in_source: 'No value printed in the cited span',
  value_not_in_span: 'Value not found in the cited span',
  label_not_in_span: 'Name not found in the cited span',
  no_date_in_source: 'No date printed for this item',
  date_not_in_span: 'Date not found in the cited span',
  review_flagged: 'Held by the review pass',
};

export interface QuarantinedField {
  field: CandidateField;
  reason: QuarantineReason;
  detail: string;
}

export interface VerificationResult {
  published: CandidateField[];
  quarantined: QuarantinedField[];
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

export function checkField(field: CandidateField, spans: Map<string, ParsedSpan>): QuarantinedField | null {
  const hold = (reason: QuarantineReason, detail: string): QuarantinedField => ({ field, reason, detail });
  if (field.spanIds.length === 0) return hold('no_source_span', 'The field cites no source span.');
  const cited = field.spanIds.map((id) => spans.get(id));
  if (cited.some((s) => !s)) return hold('span_not_found', 'A cited span id is not in the parsed document.');
  const found = cited as ParsedSpan[];
  const ambiguous = found.find((s) => s.ambiguity);
  if (ambiguous) return hold('ambiguous_span', ambiguous.ambiguity!.detail);
  if (field.ambiguity) return hold('ambiguous_span', field.ambiguity);
  const text = squash(found.map((s) => s.rawText).join('\n'));
  if (field.value === null) return hold('no_value_in_source', 'No value is printed for this item.');
  if (!text.includes(squash(field.value))) return hold('value_not_in_span', `"${field.value}" does not appear in the cited text.`);
  if (field.category !== 'activity' && !text.includes(squash(field.label))) return hold('label_not_in_span', `"${field.label}" does not appear in the cited text.`);
  if (field.category === 'activity' && !text.includes(squash(`"${field.label}"`)) && !found.some((s) => s.locator.pointer?.endsWith(`/${field.label}`))) {
    return hold('label_not_in_span', `"${field.label}" is not the key of the cited value.`);
  }
  if (!field.dateRaw || !field.date) return hold('no_date_in_source', 'No printed date applies to this item.');
  if (!text.includes(squash(field.dateRaw))) return hold('date_not_in_span', `"${field.dateRaw}" does not appear in the cited text.`);
  return null;
}

export function verifyDeterministic(fields: CandidateField[], spans: ParsedSpan[]): VerificationResult {
  const byId = new Map(spans.map((s) => [s.id, s]));
  const published: CandidateField[] = [];
  const quarantined: QuarantinedField[] = [];
  for (const f of fields) {
    const q = checkField(f, byId);
    if (q) quarantined.push(q);
    else published.push(f);
  }
  return { published, quarantined };
}

/** Muse Spark review over fields that already passed the checker. Can only move fields to quarantine. */
export async function reviewWithModel(result: VerificationResult, spans: ParsedSpan[], client: ChatClient): Promise<VerificationResult> {
  if (result.published.length === 0) return result;
  const byId = new Map(spans.map((s) => [s.id, s]));
  const reply = await client.complete([
    { role: 'system', content: TRANSCRIBE_ONLY },
    {
      role: 'user',
      content: reviewPrompt(
        result.published.map((f) => ({
          id: f.id,
          label: f.label,
          value: f.value,
          unit: f.unit,
          date_text: f.dateRaw,
          source_text: f.spanIds.map((id) => byId.get(id)?.rawText ?? '').join(' | '),
        })),
      ),
    },
  ]);
  const parsed = parseJsonReply(reply) as { unsupported?: { id?: unknown; why?: unknown }[] };
  if (!Array.isArray(parsed.unsupported)) throw new SyntaxError('Missing unsupported array');
  const flagged = new Map(parsed.unsupported.filter((u) => typeof u.id === 'string').map((u) => [u.id as string, typeof u.why === 'string' ? u.why.slice(0, 200) : 'Flagged by review.']));
  return {
    published: result.published.filter((f) => !flagged.has(f.id)),
    quarantined: [...result.quarantined, ...result.published.filter((f) => flagged.has(f.id)).map((f) => ({ field: f, reason: 'review_flagged' as const, detail: flagged.get(f.id)! }))],
  };
}
