// Synthetic demo corpus for Unus, created in-window (Oct 27, 2026).
// Every person, organisation, identifier and value here is fictional. No real health data.
// Deterministic: the same seed always produces byte-identical files.

import { createHash } from 'node:crypto';
import { mulberry32, rngFixed, rngInt } from './rng.ts';
import { writePdf, type PdfTextItem } from './pdf-writer.ts';
import type { SourceType } from '../types.ts';

export const CORPUS_SEED = 1026;

export const SYNTHETIC_NOTICE = 'SYNTHETIC TEST DATA - NOT A REAL PATIENT';

export const PATIENT = { name: 'Synthetic Patient A', id: 'SYN-0001-A' } as const;

export const SOURCE_NAMES = {
  cascade: 'Cascade Synthetic Laboratories',
  pinewood: 'Pinewood Synthetic Lab',
  northshore: 'Northshore Synthetic Health',
  band: 'Synthetic Band S2',
} as const;

export const FILENAMES = {
  labPdf: 'cascade-lab-report-2025-03-14.pdf',
  portalCsv: 'northshore-portal-export-2026-09-30.csv',
  wearableJson: 'synthetic-band-monthly-2024-2026.json',
  visitSummary: 'northshore-visit-summary-2026-06-02.txt',
} as const;

export interface GeneratedFile {
  filename: string;
  type: SourceType;
  bytes: Buffer;
}

export interface PlantedOccurrence {
  filename: string;
  /** Label exactly as printed in that source. */
  label: string;
  date: string | null;
  value: string | null;
  unit: string | null;
}

export interface PlantedCase {
  id: string;
  kind: 'same_test_two_labs' | 'conflicting_value' | 'no_clean_span';
  description: string;
  occurrences: PlantedOccurrence[];
}

export interface CorpusManifest {
  name: string;
  seed: number;
  synthetic: true;
  notice: string;
  files: { filename: string; type: SourceType; sha256: string; byteLength: number }[];
  dateSpan: { start: string; end: string };
  plantedCases: PlantedCase[];
}

export interface Corpus {
  files: GeneratedFile[];
  manifest: CorpusManifest;
}

const LOINC = {
  a1c: '4548-4',
  ldl: '13457-7',
  hdl: '2085-9',
  trig: '2571-8',
  tsh: '3016-3',
  weight: '29463-7',
  bp: '85354-9',
} as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function labPdf(rng: () => number): Buffer {
  const trig = String(rngInt(rng, 85, 130));
  const tsh = rngFixed(rng, 1.2, 2.8, 2);
  const rows: [string, string | null, string, string][] = [
    ['Hemoglobin A1c', '5.6', '%', '4.0-5.6'],
    ['LDL cholesterol', '112', 'mg/dL', '<100'],
    ['HDL cholesterol', '54', 'mg/dL', '>39'],
    ['Triglycerides', trig, 'mg/dL', '<150'],
    ['TSH', tsh, 'mIU/L', '0.40-4.00'],
    // Planted: result cell left empty; the value only appears in the page-2 addendum free text.
    ['Ferritin', null, 'ng/mL', '30-400'],
  ];

  const page1: PdfTextItem[] = [
    { x: 72, y: 740, size: 14, bold: true, text: ['CASCADE SYN', -15, 'THETIC LABORATORIES'] },
    { x: 72, y: 722, size: 9, text: SYNTHETIC_NOTICE },
    { x: 72, y: 696, text: `Patient: ${PATIENT.name}` },
    { x: 330, y: 696, text: `ID: ${PATIENT.id}` },
    { x: 72, y: 680, text: 'Report date: 2025-03-14' },
    { x: 330, y: 680, text: 'Collected: 2025-03-13' },
    { x: 72, y: 664, text: `Ordering clinic: ${SOURCE_NAMES.northshore}` },
    { x: 72, y: 636, size: 11, bold: true, text: 'RESULTS' },
    { x: 72, y: 618, bold: true, text: 'Test' },
    { x: 300, y: 618, bold: true, text: 'Result' },
    { x: 360, y: 618, bold: true, text: 'Units' },
    { x: 430, y: 618, bold: true, text: 'Reference range (as printed)' },
  ];
  rows.forEach(([test, value, unit, range], i) => {
    const y = 600 - i * 16;
    page1.push({ x: 72, y, text: test });
    if (value !== null) page1.push({ x: 300, y, text: value });
    page1.push({ x: 360, y, text: unit });
    page1.push({ x: 430, y, text: range });
  });
  page1.push(
    { x: 72, y: 490, size: 8, text: '* Ferritin result issued in addendum (page 2).' },
    { x: 72, y: 60, size: 8, text: 'Page 1 of 2' },
  );

  const page2: PdfTextItem[] = [
    { x: 72, y: 740, size: 14, bold: true, text: 'CASCADE SYNTHETIC LABORATORIES - ADDENDUM' },
    { x: 72, y: 722, size: 9, text: SYNTHETIC_NOTICE },
    { x: 72, y: 696, text: `Patient ID: ${PATIENT.id}` },
    { x: 72, y: 670, text: 'Ferritin result reported separately:' },
    { x: 260, y: 670, text: '48 ng/mL' },
    { x: 72, y: 654, text: 'Collection date for this result is not stated on this addendum.' },
    { x: 72, y: 60, size: 8, text: 'Page 2 of 2' },
  ];

  return writePdf([{ items: page1 }, { items: page2, compress: true }], 'Cascade Synthetic Laboratories - Lab Report');
}

function portalCsv(rng: () => number): Buffer {
  const header = ['Result Date', 'Test Name', 'Result', 'Units', 'Reference Range', 'Performing Lab', 'LOINC', 'Comment'];
  const P = SOURCE_NAMES.pinewood;
  const C = SOURCE_NAMES.cascade;
  const N = SOURCE_NAMES.northshore;
  const rows: string[][] = [
    ['2024-02-10', 'HGB A1C', '5.4', '%', '<5.7', P, LOINC.a1c, ''],
    ['2024-02-10', 'LDL CHOL', String(rngInt(rng, 105, 125)), 'mg/dL', '<100', P, LOINC.ldl, ''],
    ['2024-02-10', 'HDL CHOL', String(rngInt(rng, 48, 58)), 'mg/dL', '>39', P, LOINC.hdl, ''],
    ['2024-02-10', 'TRIGLYCERIDE', String(rngInt(rng, 85, 130)), 'mg/dL', '<150', P, LOINC.trig, ''],
    // Planted conflict: the portal re-reports the Cascade A1c as 5.8; the Cascade PDF prints 5.6.
    ['03/13/2025', 'Hemoglobin A1c', '5.8', '%', '4.0-5.6', C, LOINC.a1c, 'Imported from outside lab, transcribed by portal'],
    ['03/13/2025', 'LDL Cholesterol', '112', 'mg/dL', '<100', C, LOINC.ldl, 'Imported from outside lab, transcribed by portal'],
    ['2025-09-22', 'HGB A1C', '5.5', '%', '<5.7', P, LOINC.a1c, ''],
    ['2025-09-22', 'LDL CHOL', String(rngInt(rng, 100, 120)), 'mg/dL', '<100', P, LOINC.ldl, ''],
    ['2025-09-22', 'HDL CHOL', String(rngInt(rng, 48, 58)), 'mg/dL', '>39', P, LOINC.hdl, ''],
    // Planted conflict: the visit summary for the same day prints 72.4 kg.
    ['06/02/2026', 'Weight', '72.9', 'kg', '', N, LOINC.weight, 'Entered at front desk, scale 2'],
    ['06/02/2026', 'Blood Pressure', '118/76', 'mmHg', '', N, LOINC.bp, ''],
    ['2026-08-11', 'HGB A1C', '5.6', '%', '<5.7', P, LOINC.a1c, ''],
    ['2026-08-11', 'TSH', rngFixed(rng, 1.2, 2.8, 2), 'mIU/L', '0.45-4.50', P, LOINC.tsh, 'Specimen received\nafter courier delay'],
  ];
  const lines = [
    `# ${N} - Patient Portal Export`,
    `# ${SYNTHETIC_NOTICE}`,
    `# Patient ID: ${PATIENT.id}`,
    '# Exported: 2026-09-30',
    header.join(','),
    ...rows.map((r) => r.map(csvCell).join(',')),
    '',
    '',
  ];
  // Messy-but-controlled: UTF-8 BOM, CRLF line endings, mixed date formats, quoted commas, an embedded newline.
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')]);
}

function wearableJson(rng: () => number): Buffer {
  const records: Record<string, string | number | null>[] = [];
  for (let year = 2024; year <= 2026; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 2026 && month > 9) break;
      const label = `${year}-${String(month).padStart(2, '0')}`;
      records.push({
        // Planted: one record lost its month during a partial device sync.
        month: label === '2025-07' ? null : label,
        days_with_data: rngInt(rng, 20, 31),
        resting_hr_bpm: rngInt(rng, 58, 66),
        steps_daily_avg: rngInt(rng, 6500, 10500),
        sleep_min_nightly_avg: rngInt(rng, 390, 450),
      });
    }
  }
  const doc = {
    schema: 'synthetic-wearable-aggregate/v1',
    notice: SYNTHETIC_NOTICE,
    source: { device: SOURCE_NAMES.band, vendor: 'Synthetic Wearables Co.' },
    subject_id: PATIENT.id,
    exported_at: '2026-10-01',
    period: 'monthly',
    records,
  };
  return Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

function visitSummary(): Buffer {
  const text = [
    `${SOURCE_NAMES.northshore.toUpperCase()} - VISIT SUMMARY`,
    SYNTHETIC_NOTICE,
    '',
    'PATIENT',
    `Name: ${PATIENT.name}`,
    `ID: ${PATIENT.id}`,
    '',
    'VISIT',
    'Date: 2026-06-02',
    'Type: Annual visit',
    'Clinician: Dr. Example Synthetic',
    '',
    'VITALS',
    'Blood pressure: 118/76 mmHg',
    'Heart rate: 64 bpm',
    'Weight: 72.4 kg',
    'Height: 176 cm',
    '',
    'MEDICATIONS (AS LISTED)',
    'atorvastatin 10 mg tablet - 1 tablet by mouth daily',
    'vitamin D3 1000 IU capsule - 1 capsule by mouth daily',
    '',
    'TESTS ORDERED',
    'Lipid panel',
    'Hemoglobin A1c',
    '',
  ].join('\n');
  return Buffer.from(text, 'utf8');
}

const PLANTED_CASES: PlantedCase[] = [
  {
    id: 'a1c-two-labs',
    kind: 'same_test_two_labs',
    description: 'Hemoglobin A1c reported by two different labs under different names; Thursday entity resolution is expected to place them on one timeline entry with every source listed.',
    occurrences: [
      { filename: FILENAMES.labPdf, label: 'Hemoglobin A1c', date: '2025-03-13', value: '5.6', unit: '%' },
      { filename: FILENAMES.portalCsv, label: 'HGB A1C', date: '2025-09-22', value: '5.5', unit: '%' },
      { filename: FILENAMES.portalCsv, label: 'HGB A1C', date: '2026-08-11', value: '5.6', unit: '%' },
    ],
  },
  {
    id: 'a1c-conflict',
    kind: 'conflicting_value',
    description: 'Same Cascade A1c specimen: the lab PDF prints 5.6, the portal re-report says 5.8. Both must be shown side by side.',
    occurrences: [
      { filename: FILENAMES.labPdf, label: 'Hemoglobin A1c', date: '2025-03-13', value: '5.6', unit: '%' },
      { filename: FILENAMES.portalCsv, label: 'Hemoglobin A1c', date: '2025-03-13', value: '5.8', unit: '%' },
    ],
  },
  {
    id: 'weight-conflict',
    kind: 'conflicting_value',
    description: 'Weight on 2026-06-02: visit summary prints 72.4 kg, portal export says 72.9 kg. Both must be shown side by side.',
    occurrences: [
      { filename: FILENAMES.visitSummary, label: 'Weight', date: '2026-06-02', value: '72.4', unit: 'kg' },
      { filename: FILENAMES.portalCsv, label: 'Weight', date: '2026-06-02', value: '72.9', unit: 'kg' },
    ],
  },
  {
    id: 'ferritin-no-span',
    kind: 'no_clean_span',
    description: 'Ferritin row has an empty result cell; the value appears only in page-2 addendum free text with no stated date. Expected to be quarantined.',
    occurrences: [{ filename: FILENAMES.labPdf, label: 'Ferritin', date: null, value: null, unit: 'ng/mL' }],
  },
  {
    id: 'wearable-missing-month',
    kind: 'no_clean_span',
    description: 'One monthly wearable record has month: null, so its values cannot be tied to a date. Expected to be quarantined.',
    occurrences: [{ filename: FILENAMES.wearableJson, label: 'resting_hr_bpm', date: null, value: null, unit: null }],
  },
];

export function generateCorpus(seed: number = CORPUS_SEED): Corpus {
  const rng = mulberry32(seed);
  // Order matters for determinism: each generator draws from the shared stream in a fixed sequence.
  const files: GeneratedFile[] = [
    { filename: FILENAMES.labPdf, type: 'lab_pdf', bytes: labPdf(rng) },
    { filename: FILENAMES.portalCsv, type: 'portal_csv', bytes: portalCsv(rng) },
    { filename: FILENAMES.wearableJson, type: 'wearable_json', bytes: wearableJson(rng) },
    { filename: FILENAMES.visitSummary, type: 'visit_summary', bytes: visitSummary() },
  ];
  const manifest: CorpusManifest = {
    name: 'Unus synthetic demo corpus',
    seed,
    synthetic: true,
    notice: 'All records are synthetic and created in-window for the Unus hackathon demo. No real health data.',
    files: files.map((f) => ({
      filename: f.filename,
      type: f.type,
      sha256: createHash('sha256').update(f.bytes).digest('hex'),
      byteLength: f.bytes.length,
    })),
    dateSpan: { start: '2024-01', end: '2026-09' },
    plantedCases: PLANTED_CASES,
  };
  return { files, manifest };
}
