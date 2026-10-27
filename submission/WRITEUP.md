# Unus — submission write-up (DRAFT, for Niko to edit and submit)

**Unus — your health passport, by Laymen.** One passport. Every record. Every fact proved.
Track: Startup · Theme: Build for Your World · Solo: Niko Callas (Representative)
Live demo: https://unus-mu.vercel.app · Repo: https://github.com/nikocallas/unus · Video: [VIDEO LINK]

## Impact (30%)

A person's health record is scattered across lab portals, PDFs in their email, wearable exports and visit
summaries from clinics that do not talk to each other. Nobody holds the whole picture — least of all the
person it belongs to. Unus turns that pile into one passport the person carries: one timeline, every entry
stamped with the exact document and line it came from, exportable anywhere as FHIR-shaped JSON. It does
not tell anyone what their records mean; it proves what they say. That makes it useful to anyone who has
ever re-typed a lab value into a form, switched clinics, or tried to answer "when was this last measured,
and by whom?" — and it is the record layer of Laymen, the company I am building.

## Meta AI Tooling (25%)

Unus is an agentic workflow built on three Meta models, each in a bounded role. **Muse Spark Open, served
on Baseten (`meta-models/muse-spark-open-1026`)**, is the extraction agent: it reads each document's
source spans and returns candidate fields that must cite span ids. **Muse Spark on the Meta Model API
(Standard tier only)** does two jobs: it normalizes candidates to shared concepts (so "HGB A1C" and
"Hemoglobin A1c" from two labs line up as one measure) and it runs a review pass inside the verification
gate that can hold fields but never publish them. **Muse Image** generates the Record Atlas illustration
from the record's structure only — sources, counts, date span — never from values. Every prompt is in the
repo (`lib/agent/prompts.ts`) and restricts the models to transcription. The Meta Model API client refuses
to run unless Standard tier is attested; Contributor tier is never used.
Live as of Oct 27: Muse Spark `muse-spark-1.3` (the Standard-tier model id — the client refuses `-contributor` ids) for normalization and review, and Muse Image `muse-image-1.0` for the Atlas. [UPDATE BEFORE SUBMITTING: Spark Open extraction is live only once the Baseten key is set; until then the demo labels extraction as parser fallback.]

## Technical Depth & Execution (20%)

Real messy formats, parsed deterministically with stable span ids: PDF text extraction (page tree, content
streams incl. FlateDecode and TJ kerning, line grouping, header-aligned table detection), RFC-4180 CSV
(BOM, preamble, quoted commas, embedded newlines, mixed date formats), wearable JSON with exact offsets and
JSON pointers, and sectioned visit summaries. The **verification gate** publishes a field only when its
cited spans exist, are unambiguous, and literally contain its name, value and date — everything else is
"held for review" and never reaches the timeline or the verified export; a model can add holds but cannot
remove them. Entity resolution groups by concept and date and keeps differing values side by side. Every
Meta stage has an honest, labelled deterministic fallback, so a failed model call degrades instead of
blanking the page. Export is a FHIR-shaped Bundle (Observation, DiagnosticReport, MedicationStatement,
Encounter) with provenance on every resource. A fresh Supabase project logs runs (RLS on, no client
access; a passport snapshot is stored only for the synthetic sample, enforced in the database). 29
tests cover the parsers, gate, resolution, export, and mocked Meta model success and failure paths.

## Demo (25%)

The video shows the deployed app, not localhost: a pile of mismatched synthetic records (lab PDF, portal
CSV, wearable JSON, visit summary) dropped in; the agent run step by step — ingest, extract, normalize,
verify, resolve, timeline — each labelled with the engine that ran it; five fields held for review on
purpose (a lab row with no printed value, and a wearable month with no date); the clean timeline with
filters and search; two places where sources differ, shown side by side; a click on any value opening the
exact highlighted source lines; the Record Atlas; and the passport exported as FHIR-shaped JSON. Judges can
reproduce the same corpus byte for byte (seed 1026) with one click or `npm run demo:run`.

## Bonus opt-ins (flag every one in the form)

- Most Viral — X post link: [X POST LINK]
- Best Build on Meta Open Weight Models — Muse Spark Open on Baseten, `meta-models/muse-spark-open-1026` (`lib/models/clients.ts`, `lib/agent/extract.ts`)
- Community Vote — gallery link shared Nov 9–16 only
- Best Agentic Use-Case — ingest → extract → normalize → verify → resolve → timeline → export
- Best Creative Build — Muse Image Record Atlas
