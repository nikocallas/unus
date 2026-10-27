# New work manifest

Every file below was created during the hackathon build window (Oct 26 – Nov 4, 2026).
Nothing pre-existing is presented as a feature. Background only: Laymen brand direction.

## Tue Oct 27 — fixtures + ingest

| Path | What it is |
|---|---|
| `lib/types.ts` | Ingest contract: `SourceDocument`, `ParsedSpan`, per-format structures |
| `lib/fixtures/rng.ts` | Seeded PRNG (mulberry32) |
| `lib/fixtures/pdf-writer.ts` | Deterministic minimal PDF writer (plain + FlateDecode pages, TJ kerning) |
| `lib/fixtures/corpus.ts` | Synthetic corpus generator: lab PDF, portal CSV, wearable JSON, visit summary + manifest of planted cases |
| `lib/fixtures/check.ts` | Confirms planted cases (two-lab test, conflicts, no-clean-span) survive parsing |
| `lib/ingest/document.ts` | Stable document ids (sha256), status, text decoding helpers |
| `lib/ingest/pdf.ts` | PDF text extraction: page tree, content-stream tokenizer, line grouping, table detection |
| `lib/ingest/csv.ts` | Portal CSV parser: BOM, preamble, quoting, embedded newlines, row + cell spans |
| `lib/ingest/json.ts` | Wearable JSON parser with exact offsets, JSON pointers and line numbers per leaf |
| `lib/ingest/text.ts` | Visit summary parser: titled sections with line spans |
| `lib/ingest/index.ts` | Type detection + dispatch; never throws |
| `lib/pipeline/parser-extract.ts` | Deterministic parser-only extraction (model-failure fallback) |
| `lib/pipeline/timeline.ts` | Parser-only chronological timeline + descriptive coverage stats |
| `lib/pipeline/run.ts` | Orchestration: ingest → extract (with fallback) → timeline |
| `lib/agent/types.ts` | `CandidateField` + `ExtractionStage` contract |
| `lib/agent/extract.ts` | Stage 1 stub (Muse Spark Open) + fallback wrapper |
| `lib/agent/normalize.ts` | Stage 2 stub (Muse Spark normalize + resolve) |
| `lib/agent/fhir.ts` | FHIR-shaped resource types with provenance |
| `lib/agent/verify.ts` | Verification gate types (Thursday) |
| `lib/config/meta.ts` | Meta model ids and env var names (Standard tier only) |
| `scripts/generate-fixtures.ts` | `npm run fixtures` |
| `scripts/demo-parse.ts` | `npm run demo:parse` |
| `test/*.test.ts` | Unit + end-to-end tests (node:test) |
| `fixtures/corpus/*` | Generated synthetic corpus + manifest |
| `README.md`, `NEW-WORK.md`, `.env.example`, `package.json`, `tsconfig.json`, `.gitignore` | Project scaffolding |
