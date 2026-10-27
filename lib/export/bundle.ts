// Export: the unified record as a FHIR-shaped Bundle. Only verified (published) values become
// resources. Quarantined fields go in a separate, clearly labelled `heldForReview` section that is
// outside the Bundle entries and never mixed into the verified record.

import type { DiagnosticReport, Encounter, MedicationStatement, Observation, UnusResource } from '../agent/fhir.ts';
import type { Passport } from '../pipeline/passport.ts';

function provenance(passport: Passport, fieldIds: string[], spanIds: string[], documentIds: string[]) {
  return {
    fieldIds,
    spanIds,
    sources: documentIds.map((id) => ({ documentId: id, sourceName: passport.documents.find((d) => d.id === id)?.sourceName ?? null })),
  };
}

export function toResources(passport: Passport): UnusResource[] {
  const resources: UnusResource[] = [];
  const observationsByDoc = new Map<string, string[]>();
  for (const entry of passport.entries) {
    entry.values.forEach((v, i) => {
      const id = `${entry.id}#${i + 1}`.replace(/[^A-Za-z0-9.#@:-]/g, '-');
      const prov = { provenance: provenance(passport, [v.fieldId], v.spanIds, [v.documentId]) };
      if (entry.category === 'medication') {
        const r: MedicationStatement = { resourceType: 'MedicationStatement', id, medication: { text: v.labelAsPrinted }, dosage: [{ text: v.value }], dateAsserted: entry.date, unus: prov };
        resources.push(r);
        return;
      }
      if (entry.category === 'visit') {
        const r: Encounter = { resourceType: 'Encounter', id, type: [{ text: v.value }], period: { start: entry.date }, serviceProvider: v.sourceName ? { display: v.sourceName } : undefined, unus: prov };
        resources.push(r);
        return;
      }
      const numeric = /^-?\d+(\.\d+)?$/.test(v.value.trim());
      const loinc = entry.conceptKey.startsWith('loinc:') ? entry.conceptKey.slice(6) : null;
      const r: Observation = {
        resourceType: 'Observation',
        id,
        category: entry.category === 'lab' ? 'laboratory' : entry.category === 'vital' ? 'vital-signs' : 'activity',
        code: { text: entry.display, coding: [...(loinc ? [{ system: 'http://loinc.org', code: loinc, display: entry.display }] : []), { display: v.labelAsPrinted }] },
        effectiveDateTime: entry.date,
        ...(numeric ? { valueQuantity: { value: Number(v.value), unit: v.unit } } : {}),
        valueString: v.unit ? `${v.value} ${v.unit}` : v.value,
        ...(v.referenceRangeText ? { referenceRange: [{ text: v.referenceRangeText }] } : {}),
        ...(v.sourceName ? { performer: [{ display: v.sourceName }] } : {}),
        unus: prov,
      };
      resources.push(r);
      if (entry.category === 'lab') observationsByDoc.set(v.documentId, [...(observationsByDoc.get(v.documentId) ?? []), id]);
    });
  }
  // One DiagnosticReport per lab-report document, referencing its verified Observations.
  for (const doc of passport.documents.filter((d) => d.type === 'lab_pdf')) {
    const refs = observationsByDoc.get(doc.id) ?? [];
    if (refs.length === 0) continue;
    const r: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: `report-${doc.id}`,
      code: { text: doc.filename },
      effectiveDateTime: null,
      issued: doc.date,
      performer: doc.sourceName ? [{ display: doc.sourceName }] : undefined,
      result: refs.map((id) => ({ reference: `Observation/${id}` })),
      unus: { provenance: provenance(passport, [], [], [doc.id]) },
    };
    resources.push(r);
  }
  return resources;
}

export function buildExport(passport: Passport) {
  return {
    unus: {
      format: 'unus-passport/v1',
      notice: 'Transcribed from the listed source documents. Every resource lists the source spans it came from. Unus adds no interpretation.',
      runAt: passport.runAt,
      corpus: passport.corpus,
      engines: passport.engines,
      coverage: passport.coverage,
      documents: passport.documents.map(({ id, filename, type, sourceName, date }) => ({ id, filename, type, sourceName, date })),
    },
    record: {
      resourceType: 'Bundle',
      type: 'collection',
      entry: toResources(passport).map((resource) => ({ resource })),
    },
    heldForReview: {
      notice: 'NOT VERIFIED. These items could not be traced to a clean source span and are not part of the record above.',
      items: passport.quarantined.map((q) => ({
        label: q.label,
        value: q.value,
        unit: q.unit,
        dateAsPrinted: q.dateAsPrinted,
        documentId: q.documentId,
        spanIds: q.spanIds,
        reason: q.reason,
        detail: q.detail,
      })),
    },
  };
}
