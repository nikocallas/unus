# Submission checklist — status as of Oct 27, 2026

Submit by **Wed Nov 4, 6:00 PM CT** (hard deadline 8:00 PM CT). Niko submits; nothing here is submitted
or posted automatically.

| Item | Status | Evidence |
|---|---|---|
| Portal submission: Startup track, Representative Niko Callas, solo | **Blocked — Niko** | Portal: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit |
| Live demo URL opens and works cold, no setup | **Verified (fallback mode)** | https://unus-mu.vercel.app → 200 logged-out; sample run end to end in ~2 s; drop-files flow returns the same passport (149 entries, 153 verified values, 5 held, 2 differing). Meta model stages currently run as labelled fallbacks (no keys set on Vercel). |
| Public repo opens logged-out | **Verified** | https://github.com/nikocallas/unus → 200 logged-out |
| `NEW-WORK.md` + "Built Oct 26 – Nov 4" README section (actual dates) + prior-work disclosure | **Verified** | `NEW-WORK.md` (dated Oct 27), README sections "Built Oct 26 – Nov 4" and "Prior-work disclosure" |
| No real health data anywhere | **Verified** | Data scan in `COMPLIANCE-REPORT.md`; corpus generated from seed 1026, all marked synthetic |
| 3-minute video, recorded against the deployed URL | **Blocked — Niko** | Script + shot list: `submission/VIDEO-SCRIPT.md` |
| Write-up, one paragraph per criterion | **Draft** | `submission/WRITEUP.md` — has a [CONFIRM] marker on which Meta stages ran live |
| Bonus opt-ins flagged: Most Viral, Open Weights, Community Vote, Agentic, Creative | **Draft** | Listed in `submission/WRITEUP.md`; flag each in the form |
| X demo post link included | **Blocked — Niko** | Draft: `submission/X-POST.md` |
| Everyone who worked on it listed | **Draft** | Solo: Niko Callas |
| Meta models running live in the demo | **Blocked — keys** | Set the env vars in `.env.example` on the Vercel project `unus` (Laymen team), then re-run; the Agent run panel shows "Meta model" vs "Fallback" per stage |
