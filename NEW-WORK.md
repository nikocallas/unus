# New work manifest

Every file below was created during the hackathon build window (Oct 26 – Nov 4, 2026), with the actual
date it was built. Nothing pre-existing is presented as a feature. Background only: Laymen brand direction.

## Oct 27 — fixtures + ingest (Phase 1)

| Path | What it is |
|---|---|
| `lib/types.ts` | Ingest contract: `SourceDocument`, `ParsedSpan`, per-format structures |
| `lib/fixtures/rng.ts` | Seeded PRNG (mulberry32) |
| `lib/fixtures/pdf-writer.ts` | Deterministic minimal PDF writer (plain + FlateDecode pages, TJ kerning) |
| `lib/fixtures/corpus.ts` | Synthetic corpus generator: lab PDF, portal CSV, wearable JSON, visit summary + planted-case manifest |
| `lib/fixtures/check.ts` | Confirms planted cases survive parsing |
| `lib/ingest/*.ts` | Deterministic parsers (PDF, CSV, JSON, visit text) with stable span ids; never throw |
| `lib/pipeline/parser-extract.ts` | Deterministic parser-only extraction (model-failure fallback) |
| `lib/pipeline/timeline.ts` | Phase 1 parser-only timeline + coverage |
| `scripts/generate-fixtures.ts`, `scripts/demo-parse.ts` | `npm run fixtures`, `npm run demo:parse` |
| `fixtures/corpus/*` | Generated synthetic corpus + manifest |

## Oct 27 — agent workflow, app, persistence (Phases 2–5)

| Path | What it is |
|---|---|
| `lib/config/meta.ts` | Meta model ids and env var names (Standard tier only) |
| `lib/models/clients.ts` | Env-gated clients: Muse Spark Open (Baseten), Muse Spark + Muse Image (Meta Model API, Standard-tier attestation required) |
| `lib/agent/prompts.ts` | Every model prompt, transcription-only |
| `lib/agent/extract.ts` | Stage 1: Spark Open extraction with span validation; parser fallback |
| `lib/agent/normalize.ts` | Stage 2a: concept assignment (Muse Spark; deterministic LOINC table fallback) |
| `lib/agent/verify.ts` | Verification gate: deterministic span checker + Muse Spark review (hold-only) |
| `lib/agent/resolve.ts` | Stage 2b: entity resolution; differing values kept side by side |
| `lib/agent/fhir.ts` | FHIR-shaped resource types with provenance |
| `lib/export/bundle.ts` | Export: FHIR-shaped Bundle of verified resources + separate held-for-review section |
| `lib/pipeline/passport.ts`, `lib/pipeline/run.ts` | Passport model; orchestrated, streamed, per-stage-labelled workflow |
| `lib/persistence/supabase.ts` | Optional server-side run log (never load-bearing) |
| `supabase/migrations/20261027194015_unus_runs.sql` | Fresh Unus project table (RLS on, no client access; snapshots for synthetic sample only) |
| `app/` | Next.js app: sample + drop-files flows, live agent run, coverage, Record Atlas, held-for-review panel, timeline with filters/search, source drill-down, export |
| `app/api/run`, `app/api/sample/[name]`, `app/api/atlas` | Streaming run API, sample downloads, Muse Image atlas |
| `scripts/demo-run.ts` | `npm run demo:run` — full workflow in one command |
| `test/*.test.ts` | Unit + integration tests, including mocked Meta model paths and failure fallbacks |
| `submission/*` | Submission drafts: write-up, video script, X post, gallery copy, checklist, compliance report |
| `README.md`, `NEW-WORK.md`, `.env.example`, `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore` | Project scaffolding |

## Oct 31 — hardening (weekend build block)

| Path | What changed |
|---|---|
| `lib/pipeline/run.ts`, `lib/pipeline/passport.ts` | No model call when nothing was extracted (stage says "Nothing to normalize"); per-document item counts |
| `app/UnusApp.tsx`, `app/globals.css` | Documents list showing which files were read or not read and why; empty-run message; upload size/count checked before sending |
| `app/api/run/route.ts` | Upload limit aligned with the hosting platform (4 MB per run) |
| `test/pipeline.test.ts` | Edge-case test: unreadable uploads are reported and trigger no model calls |

