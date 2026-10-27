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
| Lists the same test from two labs together, with every source | Silently picks a winner when sources disagree — both are shown side by side |
| Holds any field with no clean source span for review | Publishes a fact it cannot trace |
| Reports coverage: sources, date span, counts | Gives advice, interpretation, recommendations or "gaps" lists |

## Built Oct 26 – Nov 4

Everything in this repository was built during the Meta Global AI Developer Hackathon build window
(Oct 26 – Nov 4, 2026). See [`NEW-WORK.md`](NEW-WORK.md) for the file-by-file manifest.

**Prior-work disclosure:** the only thing carried in from before the window is Laymen brand direction
(the lowercase "laymen" wordmark and palette). No pre-existing Laymen code, features or data are used.

## Pipeline

```
ingest (deterministic parsers)          ← built Oct 27
  → extract   Muse Spark Open on Baseten (meta-models/muse-spark-open-1026)
  → normalize + resolve   Muse Spark via the Meta Model API (Standard tier)
  → verify    deterministic span checker + Muse Spark review; untraceable fields are held for review
  → timeline  + Record Atlas (Muse Image) + export
```

If a model call fails, the deterministic parser path still produces a timeline.

## Run it

Requires Node 24 (TypeScript runs natively; no build step).

```sh
npm install
npm run demo:parse   # generate the synthetic corpus, parse it end to end, print what parsed and what did not
npm test
npm run typecheck
```

`npm run fixtures` regenerates `fixtures/corpus/` only.

## Data

The demo corpus in `fixtures/corpus/` is **synthetic**, generated in-window from a fixed seed (1026) so
anyone can reproduce it byte for byte. It contains no real health data. Live uploads are processed
in-session only and are never stored in this repository.

## Configuration

Copy `.env.example` to `.env.local` (ignored). Keys are read from environment variables only.
All product model calls go to Meta models; the Meta Model API is used on the Standard tier only.
