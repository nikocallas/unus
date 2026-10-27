// Prompts sent to Meta models. Kept in one file so anyone can read exactly what the models are asked.
// Every prompt restricts the model to transcription and structuring: no interpretation, judgment or advice.

export const TRANSCRIBE_ONLY = [
  'You are a transcription component inside Unus, a health record organizer.',
  'You copy what source documents state. You never interpret, judge, rank, diagnose, advise or recommend.',
  'Never label any value as normal, abnormal, high, low, good, bad, healthy or concerning.',
  'Never add values, units, dates or names that are not printed in the input.',
  'Reference ranges are copied exactly as printed, or left null.',
  'Reply with JSON only.',
].join('\n');

export function extractionPrompt(documentType: string, sourceName: string | null, spans: { id: string; text: string }[]): string {
  return [
    `Document type: ${documentType}. Source as printed: ${sourceName ?? 'not stated'}.`,
    'Below are the document\'s spans, one per line, as "<span_id>\\t<text exactly as in the source>".',
    'List every measurement, test result, vital sign, activity aggregate, medication entry and visit record the spans state.',
    'For each, return:',
    '{"label": test/measure/medication name exactly as printed,',
    ' "value": value exactly as printed or null, "unit": unit exactly as printed or null,',
    ' "date_text": the date exactly as printed that applies to this item, or null if no printed date applies,',
    ' "reference_range_text": exactly as printed or null,',
    ' "category": one of "lab" | "vital" | "activity" | "medication" | "visit",',
    ' "span_ids": the ids of the spans that contain the label, the value and the date}',
    'If an item\'s value or date cannot be found in a span, still list it with value or date_text null. Do not guess.',
    'Return {"fields": [...]}.',
    '',
    ...spans.map((s) => `${s.id}\t${s.text}`),
  ].join('\n');
}

export function normalizationPrompt(items: { key: string; label: string; unit: string | null; category: string; code: string | null }[]): string {
  return [
    'Map each record item to a concept so that the same test or measure from different sources shares one concept.',
    'Use the LOINC code as concept_key when you are certain of it (for example "loinc:4548-4"); otherwise use a lowercase slug of the common name (for example "name:steps-daily-average").',
    'display is a plain, neutral name for the concept. Do not change, convert or comment on any value.',
    'Items:',
    ...items.map((i) => JSON.stringify(i)),
    'Return {"concepts": [{"key": item key, "concept_key": string, "display": string}]}.',
  ].join('\n');
}

export function reviewPrompt(fields: { id: string; label: string; value: string | null; unit: string | null; date_text: string | null; source_text: string }[]): string {
  return [
    'Review each item against its source_text. source_text lists each cited span as "<location>: <text exactly as in the source>".',
    'An item is supported only if its label, value, unit and date_text all literally appear in source_text. For JSON sources the location is a key path, and the last key counts as the label.',
    'Do not judge the values themselves.',
    'Items:',
    ...fields.map((f) => JSON.stringify(f)),
    'Return {"unsupported": [{"id": item id, "why": short factual reason}]}. Return an empty list if every item is supported.',
  ].join('\n');
}

export function atlasPrompt(summary: { sources: { name: string; type: string; entries: number; start: string | null; end: string | null }[]; start: string | null; end: string | null; total: number }): string {
  const lines = summary.sources.map((s) => `- ${s.name} (${s.type}): ${s.entries} entries, ${s.start ?? '?'} to ${s.end ?? '?'}`);
  return [
    'An abstract, elegant atlas-style map of one person\'s health record landscape, as a wide editorial illustration.',
    `The record spans ${summary.start} to ${summary.end} with ${summary.total} entries from ${summary.sources.length} sources:`,
    ...lines,
    'Render each source as a distinct territory or river along a horizontal time axis; its size reflects its entry count.',
    'Style: Greco-futurist cartography, deep gold (#9F772A) and emerald (#13805B) on warm ivory, fine linework.',
    'No text, no numbers, no people, no medical symbols, no charts implying good or bad.',
  ].join('\n');
}
