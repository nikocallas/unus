# Unus — 3-minute demo video script + shot list (DRAFT)

Record against the deployed URL (https://unus-mu.vercel.app), never localhost. Synthetic data only on
screen. Captions on. File name: `unus-demo-2026-11-03.mp4`. Test the link logged-out before submitting.

**Before recording:** confirm which Meta stages are live (the Agent run panel shows "Meta model" or
"Fallback" on each step). Say only what the screen shows. If a stage shows Fallback, say "this stage ran on
its deterministic fallback in this recording" — do not narrate it as a Meta model.

| Time | Screen | Voice-over (placeholder — adjust to what the build shows on the day) |
|---|---|---|
| 0:00–0:15 | Unus hero, "Built Oct 26 – Nov 4, 2026" visible | "This is Unus — your health passport, by Laymen. Everything you'll see was built between October 26 and [RECORDING DATE] for the Meta hackathon. Unus turns scattered health records into one passport where every fact is proved by its source." |
| 0:15–0:45 | The four sample files opened side by side: lab PDF, portal CSV, wearable JSON, visit summary | "This is the mess. A lab report PDF. A portal export where the same test is called 'HGB A1C'. A wearable export. A visit summary. All synthetic — no real person. Different formats, different names, and they don't always agree." |
| 0:45–1:45 | Drop the files on the dropzone; Agent run panel fills step by step; then the held-for-review panel | "I drop them in. Ingest parses every page, row and key into source spans. Extract: Muse Spark Open, running on Baseten, transcribes candidate fields and must cite the spans they came from. Normalize: Muse Spark on the Meta Model API lines up the same measure across sources. Verify: every field must trace to a clean span — or it's held. Here are five held for review: a ferritin row with no printed value, and a wearable month with no date. Unus doesn't guess. Resolve, timeline." |
| 1:45–2:30 | Timeline → Labs filter → 13 Mar 2025 → Hemoglobin A1c "Sources differ — both shown" → click 5.6 → source sheet with highlighted lines; then Record Atlas | "The passport. Here the lab PDF says 5.6 and the portal re-report says 5.8 — Unus shows both, side by side, and picks neither. Click any value and you see the exact lines it came from: page one, line eight. This is the Record Atlas — the shape of the record across sources and years, illustrated with Muse Image from structure alone." |
| 2:30–3:00 | Export passport → JSON opened showing Bundle + heldForReview | "And it's yours to take: export the passport as FHIR-shaped JSON, verified facts only, held items kept separate. Muse Spark Open on Baseten, Muse Spark and Muse Image on the Meta Model API. Unus — one passport, every record, every fact proved." |

## Recording checklist

- [ ] Deployed URL only (address bar visible once)
- [ ] No real data, no personal accounts or notifications on screen
- [ ] No advice language in narration
- [ ] Every model named matches what the Agent run panel shows
- [ ] Captions/subtitles
- [ ] Under 3:00
- [ ] Uploaded; link opens logged-out
