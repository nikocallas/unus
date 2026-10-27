# Compliance + test report — Oct 27, 2026

Commit tested: `main` at the time of writing. Deployed: https://unus-mu.vercel.app (Vercel project `unus`,
Laymen team, created Oct 27). Supabase: project "Unus" (`ecymsuoejqqpojbwhxfx`, created Oct 27).

## Phase 4 tests

| # | Test | Result | How |
|---|---|---|---|
| 1 | Unit: generator determinism, every parser, entity resolution, verification gate | **Pass** | `npm test` — 29/29 |
| 2 | Integration, baked-in corpus: fixtures → … → export, every published field has a span, quarantined fields nowhere as verified | **Pass** | `npm test` (integration tests), `npm run demo:run` |
| 3 | Integration, drop-files flow: same timeline as baked-in | **Pass** | In-browser drop of the 4 downloaded sample files (local prod build) and multipart upload to the deployed API: 149 entries / 153 verified / 5 held / 2 differing — identical |
| 4 | Model failure: broken Meta clients → labelled parser fallback, no crash, no fake output | **Pass** | Test "model-failure" (HTTP 503 on every Meta call); deployed app with no keys shows "Fallback — Not configured (ENV_VAR)" per stage |
| 5 | Conflicts side by side, neither wins | **Pass** | A1c 2025-03-13 (5.6 vs 5.8) and weight 2026-06-02 (72.4 vs 72.9) shown as one entry each, "Sources differ — both shown" |
| 6 | Language scan | **Pass** | See below |
| 7 | Data scan | **Pass** | See below |
| 8 | Secrets scan | **Pass** | See below |
| 9 | Cold start on deployed URL | **Pass** | Logged-out `curl` → 200; first click on "Open the sample passport" runs end to end; no setup |
| 10 | Mobile | **Pass** | 375×812: no horizontal overflow (scrollWidth = viewport width), filters, timeline, drill-down bottom sheet, held-for-review list checked locally and on the deployed URL |
| 11 | Performance | **Pass (fallback mode)** | Sample run ~2 s end to end on Vercel; per-stage progress streams live. Re-measure once Meta keys are live. |

## Language scan

`grep -rniE "you should|recommend|abnormal|normal|risk|missing|gaps?|diagnos|healthy|elevated|concern"`
over `app/`, `lib/`, `README.md`, `NEW-WORK.md`, `.env.example`. No user-facing advice language. Remaining
hits, each justified:

- CSS `gap` properties and local variables named `gap` (layout code).
- `DiagnosticReport` — the standard FHIR resource type for a lab report; not a diagnosis.
- `lib/agent/prompts.ts` — the prompt lines that *forbid* models from diagnosing, recommending or labelling values as normal/abnormal.
- README "Unus never does" column, which lists these as things Unus does not do.
- Code comments ("key … is missing") and the internal fixture id `wearable-missing-month` — engineering text, not UI.
- Reference ranges appear only as printed in source documents, labelled "Range as printed".

## Data scan

Searched all tracked files for SSN-shaped values, "date of birth"/"DOB", personal emails. Only hit: the test
assertion that checks the corpus contains no date of birth. All corpus files carry "SYNTHETIC TEST DATA —
NOT A REAL PATIENT"; names are fictional ("Synthetic Patient A", "Cascade Synthetic Laboratories").

## Secrets scan

Searched all tracked files for API-key and JWT shapes: no hits. `.env` and `.env.local` are git-ignored;
`.env.example` contains placeholders only. Vercel holds only `SUPABASE_URL` (non-secret). No key was ever
written to the repo, including the Meta key pasted in chat on Oct 27 (rotate it if the chat is shared).

## Supabase

Table `public.unus_runs`: RLS enabled, no policies, `anon`/`authenticated` revoked (advisor reports the
expected "RLS enabled, no policy" info notice only). Check constraint stores a passport snapshot only for
`corpus = 'sample'`. Writes need `SUPABASE_SERVICE_ROLE_KEY` on Vercel — not yet set, so deployed runs
report `persisted: not_configured` and the demo is unaffected.

## Not yet verified (blockers, not failures)

- Live Meta model calls (no keys/model ids on Vercel). Mocked request/response paths are tested.
- Muse Image Atlas generation (no endpoint/model id). The slot is labelled; the code-drawn map is shown and labelled as drawn by code.
- Supabase write from the deployed app (service-role key not set).
