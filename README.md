# Unus

**Unus — your health passport, by Laymen.**
*One passport. Every record. Every fact proved.*

Unus (OO-nus, Latin for "one") turns a pile of messy health records — PDF lab reports, portal exports,
wearable aggregates, visit summaries — into one structured, user-owned health passport, where every
single fact traces back to the exact source document it came from.

Like a travel passport, Unus is carried by its owner, not by any clinic or portal. Each entry is stamped
with its provenance, and the whole passport can be exported and taken anywhere. Unus does not decide
anything. It proves what the records already say.

## What Unus does — and never does

| Unus does | Unus never does |
|---|---|
| Transcribes "Hemoglobin A1c 5.6 %" from a lab PDF, citing document, page and line | Labels any value as good, bad, high, low, normal or abnormal |
| Shows a reference range exactly as printed in the source | Computes or judges a range |
| Lines up the same test from two labs under one measure, listing every source | Silently picks a winner when sources differ — both values are shown side by side |
| Holds any field with no clean source span for review | Publishes a fact it cannot trace |
| Reports coverage: sources, date span, counts | Gives advice, interpretation, recommendations or "gaps" lists |

There is no chat, no accounts, no clinician loop.

## Built Oct 26 – Nov 4

Everything in this repository was built during the Meta Global AI Developer Hackathon build window.
Work to date was built **Oct 27, 2026**; see [`NEW-WORK.md`](NEW-WORK.md) for the dated, file-by-file manifest.

**Prior-work disclosure:** the only thing carried in from before the window is Laymen brand direction
(the lowercase "laymen" wordmark and the gold/emerald palette). No pre-existing Laymen code, features or
data are used. The Vercel project (Laymen team) and the Supabase project were both created in-window.

## The agent workflow

```
ingest     deterministic parsers: PDF text (pages/lines/tables), CSV (rows/cells), JSON (pointers), text (sections)
  → extract    Muse Spark Open on Baseten — meta-models/muse-spark-open-1026
  → normalize  Muse Spark on the Meta Model API (Standard tier) — assigns concepts only; never touches values
  → verify     deterministic span checker, then a Muse Spark review pass that can only hold fields, never publish them
  → resolve    same concept + date → one entry listing every source; differing values kept side by side
  → timeline   + Record Atlas (code-drawn map, plus Muse Image illustration) + FHIR-shaped export
```

All prompts are in [`lib/agent/prompts.ts`](lib/agent/prompts.ts); every one restricts the model to
transcription. Model clients are in [`lib/models/clients.ts`](lib/models/clients.ts). The Meta Model API
client refuses to run unless `META_MODEL_API_TIER=standard` is set, and refuses any model id containing "contributor" (the Meta Model API exposes Contributor tier as separate ids such as `muse-spark-1.3-contributor`). Unus uses `muse-spark-1.3` and `muse-image-1.0`.

**Fallbacks are honest.** If a Meta model stage has no key, no confirmed tier, or its call fails, the
deterministic path runs instead and the stage is labelled "Fallback" with the exact reason, in the UI
and in `npm run demo:run`. Nothing is canned or faked.

**The verification gate.** A field is published only if its cited source spans exist, are unambiguous, and
literally contain its name, value and date. Everything else is listed under "held for review", and never
reaches the timeline or the verified export. The sample corpus contains deliberate examples.

## Run it

Requires Node 24 (TypeScript runs natively in scripts and tests).

```sh
npm ci
npm run demo:parse   # Phase 1: generate the synthetic corpus and parse it; prints what parsed and what did not
npm run demo:run     # Full workflow on the sample corpus; writes out/unus-passport-sample.json
npm test             # unit + integration tests (node:test)
npm run typecheck
npm run dev          # http://localhost:3000
```

## Data

The demo corpus in `fixtures/corpus/` is **synthetic**, generated in-window from a fixed seed (1026) so
anyone can reproduce it byte for byte. It contains no real health data. It includes, on purpose: the same
test from two labs under two names, two values that differ across sources, and two items with no clean
source span.

Files you add in the app are processed in memory for that run and are not stored by Unus. The optional
Supabase run log stores counts and engine names only; a passport snapshot is stored only for the
synthetic sample (enforced by a database check constraint).

## Configuration

See [`.env.example`](.env.example). Keys are read from environment variables only. All product model
calls go to Meta models.
