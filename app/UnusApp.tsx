'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildExport } from '../lib/export/bundle.ts';
import type { TimelineEntry, TimelineValue } from '../lib/agent/resolve.ts';
import type { FieldCategory } from '../lib/agent/types.ts';
import type { Passport, PassportSpan, StageName, StageReport } from '../lib/pipeline/passport.ts';

const STAGES: { stage: StageName; name: string }[] = [
  { stage: 'ingest', name: 'Ingest' },
  { stage: 'extract', name: 'Extract' },
  { stage: 'normalize', name: 'Normalize' },
  { stage: 'verify', name: 'Verify' },
  { stage: 'resolve', name: 'Resolve' },
  { stage: 'timeline', name: 'Timeline' },
];

type Filter = 'all' | FieldCategory | 'imaging';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'lab', label: 'Labs' },
  { id: 'vital', label: 'Vitals' },
  { id: 'activity', label: 'Activity' },
  { id: 'medication', label: 'Medications' },
  { id: 'visit', label: 'Visits' },
  { id: 'imaging', label: 'Imaging' },
];

const CATEGORY_LABEL: Record<FieldCategory, string> = { lab: 'Lab', vital: 'Vital', activity: 'Activity', medication: 'Medication', visit: 'Visit' };
const STORAGE_KEY = 'unus.passport.v1';
const DOC_TYPE: Record<string, string> = { lab_pdf: 'lab report PDF', portal_csv: 'portal export', wearable_json: 'wearable export', visit_summary: 'visit summary' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type StageState = { status: 'waiting' | 'running' | 'done'; engine?: string; report?: StageReport };
type Selection = { kind: 'value'; entry: TimelineEntry; value: TimelineValue } | { kind: 'held'; index: number };

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const month = m ? MONTHS[Number(m) - 1] : '';
  return day ? `${Number(day)} ${month} ${y}` : `${month} ${y}`;
}

function fallbackReason(reason: string | null): string {
  if (!reason) return '';
  const [kind, why, envVar] = reason.split(':');
  if (kind === 'unavailable') {
    if (why === 'tier_not_standard') return `Standard tier not confirmed (${envVar})`;
    return `Not configured (${envVar})`;
  }
  return `Model call did not complete (${reason})`;
}

function locatorText(span: PassportSpan): string {
  const l = span.locator;
  if (l.page) return `page ${l.page}, line ${l.line}`;
  if (l.row) return `row ${l.row}${l.column ? `, column "${l.column}"` : ''} (line ${l.line})`;
  if (l.pointer !== undefined) return `${l.pointer} (line ${l.line})`;
  return `line ${l.line}`;
}

function shortLoc(span: PassportSpan): string {
  const l = span.locator;
  if (l.page) return `p${l.page} line ${l.line}`;
  if (l.row) return `row ${l.row}`;
  if (l.pointer !== undefined) return l.pointer.split('/').slice(-2).join('/');
  return `line ${l.line}`;
}

async function readStream(res: Response, onLine: (msg: Record<string, unknown>) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onLine(JSON.parse(line));
    }
  }
}

export default function UnusApp({ sampleFiles }: { sampleFiles: string[] }) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [stages, setStages] = useState<Record<StageName, StageState>>(() => Object.fromEntries(STAGES.map((s) => [s.stage, { status: 'waiting' }])) as Record<StageName, StageState>);
  const [passport, setPassport] = useState<Passport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [restored, setRestored] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setPassport(JSON.parse(saved) as Passport);
        setPhase('done');
        setRestored(true);
      }
    } catch {
      /* storage unavailable: the app works without it */
    }
  }, []);

  const run = useCallback(async (init: RequestInit) => {
    setPhase('running');
    setError(null);
    setPassport(null);
    setPersisted(null);
    setRestored(false);
    setSelection(null);
    setStages(Object.fromEntries(STAGES.map((s) => [s.stage, { status: 'waiting' }])) as Record<StageName, StageState>);
    try {
      const res = await fetch('/api/run', { method: 'POST', ...init });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'The run could not start.');
      }
      let result: Passport | null = null;
      await readStream(res, (msg) => {
        if (msg.type === 'stage-start') {
          const stage = msg.stage as StageName;
          setStages((s) => ({ ...s, [stage]: { status: 'running', engine: msg.engine as string } }));
        } else if (msg.type === 'stage-done') {
          const report = msg.report as StageReport;
          setStages((s) => ({ ...s, [report.stage]: { status: 'done', engine: report.engine, report } }));
        } else if (msg.type === 'result') {
          result = msg.passport as Passport;
          setPassport(result);
        } else if (msg.type === 'persisted') {
          setPersisted(msg.status as string);
        } else if (msg.type === 'error') {
          throw new Error(msg.message as string);
        }
      });
      if (!result) throw new Error('The run ended without a result.');
      setPhase('done');
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      } catch {
        /* quota or private mode: keep session-local */
      }
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'The run could not complete.');
    }
  }, []);

  const runSample = () => run({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ corpus: 'sample' }) });
  const runFiles = (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    const form = new FormData();
    for (const f of list) form.append('files', f);
    run({ body: form });
  };

  const clearDevice = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setPassport(null);
    setPhase('idle');
    setRestored(false);
  };

  const exportPassport = () => {
    if (!passport) return;
    const blob = new Blob([JSON.stringify(buildExport(passport), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `unus-passport-${passport.runAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="wrap">
      <header className="top">
        <span className="wordmark">laymen</span>
        <span className="built">Built Oct 26 – Nov 4, 2026</span>
      </header>

      <section className="hero">
        <h1>Unus</h1>
        <div className="tagline">One passport. Every record. Every fact proved.</div>
        <p className="lede">
          Unus turns scattered health records — lab PDFs, portal exports, wearable data, visit summaries — into one passport you carry.
          Every fact links back to the exact line of the document it came from. Unus does not decide anything for you; it proves what your
          records already say.
        </p>
        <div className="actions">
          <button className="btn" onClick={runSample} disabled={phase === 'running'}>Open the sample passport</button>
          <label className="btn ghost filelabel">
            Add your own files
            <input type="file" multiple accept=".pdf,.csv,.json,.txt,.md" disabled={phase === 'running'} onChange={(e) => e.target.files && runFiles(e.target.files)} />
          </label>
        </div>
        <div
          className={`dropzone${dragOver ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); runFiles(e.dataTransfer.files); }}
        >
          Drop PDF lab reports, portal CSV exports, wearable JSON or visit summaries here
        </div>
        <p className="fineprint">
          The sample records are synthetic — no real person. Download them to try the drop flow:{' '}
          {sampleFiles.map((f) => <a key={f} href={`/api/sample/${f}`}>{f}</a>)}
          <br />Your own files are processed in memory for this run only and are not stored by Unus.
        </p>
        {error && <div className="error" role="alert">{error}</div>}
      </section>

      {phase !== 'idle' && !restored && (
        <section className="card" aria-live="polite">
          <h2>Agent run</h2>
          <p className="sub">Each step names the engine that ran it. Fallback means a Meta model stage could not run and deterministic code was used instead.</p>
          <div className="stages">
            {STAGES.map(({ stage, name }) => {
              const st = stages[stage];
              const r = st.report;
              return (
                <div key={stage} className={`stage ${st.status}`}>
                  <div className="name">{name}<span className="dot" /></div>
                  <div className="engine">{st.engine ?? 'Waiting'}</div>
                  {r && <div className="detail">{r.detail} · {r.ms} ms</div>}
                  {r?.fallback && <div style={{ marginTop: 4 }}><span className="badge fallback">Fallback</span> <span className="detail">{fallbackReason(r.fallbackReason)}</span></div>}
                  {r && !r.fallback && /Muse/.test(r.engine) && <div style={{ marginTop: 4 }}><span className="badge meta">Meta model</span></div>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {passport && (
        <div ref={resultsRef}>
          <Results
            passport={passport}
            restored={restored}
            persisted={persisted}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            onSelect={setSelection}
            onExport={exportPassport}
            onClear={clearDevice}
          />
        </div>
      )}

      {passport && selection && <SourceSheet passport={passport} selection={selection} onClose={() => setSelection(null)} />}

      <footer className="footer">
        Unus by Laymen — built for the Meta Global AI Developer Hackathon, Oct 26 – Nov 4, 2026. Extraction: Muse Spark Open on Baseten
        (meta-models/muse-spark-open-1026). Normalization and review: Muse Spark on the Meta Model API, Standard tier. Record Atlas: Muse
        Image. Unus transcribes and organizes records; it does not give medical advice.
      </footer>
    </div>
  );
}

function Results(props: {
  passport: Passport;
  restored: boolean;
  persisted: string | null;
  filter: Filter;
  setFilter: (f: Filter) => void;
  query: string;
  setQuery: (q: string) => void;
  onSelect: (s: Selection) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  const { passport, filter, query } = props;
  const c = passport.coverage;
  const counts = useMemo(() => {
    const out: Record<string, number> = { all: passport.entries.length, imaging: 0 };
    for (const e of passport.entries) out[e.category] = (out[e.category] ?? 0) + 1;
    return out;
  }, [passport]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return passport.entries.filter((e) => {
      if (filter === 'imaging') return false;
      if (filter !== 'all' && e.category !== filter) return false;
      if (!q) return true;
      return [e.display, ...e.sources, ...e.values.map((v) => `${v.labelAsPrinted} ${v.value} ${v.unit ?? ''}`)].join(' ').toLowerCase().includes(q);
    });
  }, [passport, filter, query]);

  const byYear = useMemo(() => {
    const years = new Map<string, Map<string, TimelineEntry[]>>();
    for (const e of visible) {
      const y = e.date.slice(0, 4);
      const days = years.get(y) ?? new Map<string, TimelineEntry[]>();
      days.set(e.date, [...(days.get(e.date) ?? []), e]);
      years.set(y, days);
    }
    return [...years];
  }, [visible]);

  const shared = passport.concepts.filter((x) => x.sources.length > 1);

  return (
    <>
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <h2>Your passport</h2>
            <p className="sub">
              {passport.corpus === 'sample' ? 'Synthetic sample records' : 'Your files'} · run {new Date(passport.runAt).toLocaleString()}
              {props.restored ? ' · kept on this device' : ''}
              {props.persisted === 'stored' ? ' · run logged' : ''}
            </p>
          </div>
          <div className="actions">
            <button className="btn small" onClick={props.onExport}>Export passport (JSON)</button>
            <button className="btn small ghost" onClick={props.onClear}>Remove from this device</button>
          </div>
        </div>
        <div className="stats">
          <div className="stat"><div className="k">Sources</div><div className="v">{c.sources}</div></div>
          <div className="stat"><div className="k">Date span</div><div className="v" style={{ fontSize: 22 }}>{fmtDate(c.dateSpan.start)} – {fmtDate(c.dateSpan.end)}</div></div>
          <div className="stat"><div className="k">Timeline entries</div><div className="v">{c.entries}</div></div>
          <div className="stat"><div className="k">Verified values</div><div className="v">{c.verifiedValues}</div></div>
          <div className="stat"><div className="k">Held for review</div><div className="v">{c.heldForReview}</div></div>
          <div className="stat"><div className="k">Entries found in several documents</div><div className="v">{c.multiDocumentEntries}</div></div>
          <div className="stat"><div className="k">Entries where sources differ</div><div className="v">{c.conflicts}</div></div>
        </div>
        <p className="sub" style={{ marginTop: 8 }}>
          Engines — extract: {passport.engines.extract} · normalize: {passport.engines.normalize} · verify: {passport.engines.review}
        </p>
      </section>

      <Atlas passport={passport} />

      {passport.quarantined.length > 0 && (
        <section className="card held">
          <h2>{passport.quarantined.length} {passport.quarantined.length === 1 ? 'field' : 'fields'} held for review</h2>
          <p className="sub">These could not be traced to a clean source span, so they are not in the timeline or the verified export.</p>
          <ul>
            {passport.quarantined.map((q, i) => (
              <li key={q.fieldId}>
                <span>
                  <strong>{q.label}</strong> {q.value ? `${q.value}${q.unit ? ` ${q.unit}` : ''}` : <em style={{ color: 'var(--muted)' }}>no value</em>}
                  <span className="src" style={{ color: 'var(--muted)', fontSize: 12 }}> · {passport.documents.find((d) => d.id === q.documentId)?.filename}</span>
                  <div className="why">{q.reasonLabel}: {q.detail}</div>
                </span>
                <button className="btn small ghost" onClick={() => props.onSelect({ kind: 'held', index: i })}>See source</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Timeline</h2>
        <p className="sub">Select any value to see the exact source text it was transcribed from.</p>
        <div className="toolbar">
          {FILTERS.map((f) => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => props.setFilter(f.id)}>
              {f.label}<span className="n">{counts[f.id] ?? 0}</span>
            </button>
          ))}
          <input className="search" type="search" placeholder="Search tests, sources, values" value={query} onChange={(e) => props.setQuery(e.target.value)} />
        </div>
        {visible.length === 0 && <div className="empty">{filter === 'imaging' ? 'No imaging records in these sources.' : 'No entries match.'}</div>}
        {byYear.map(([year, days]) => (
          <div key={year}>
            <div className="year">{year}</div>
            {[...days].map(([date, entries]) => (
              <div className="day" key={date}>
                <div className="date">{fmtDate(date)}</div>
                <div>
                  {entries.some((e) => e.category === 'activity') && (
                    <div className="entry">
                      <div className="title">Device aggregates<span className="cat">Activity · {entries.find((e) => e.category === 'activity')!.sources.join(', ')}</span></div>
                      <div className="compact">
                        {entries.filter((e) => e.category === 'activity').flatMap((e) => e.values.map((v) => (
                          <button key={v.fieldId} className="value" onClick={() => props.onSelect({ kind: 'value', entry: e, value: v })}>
                            <div className="num">{v.value}{v.unit ? ` ${v.unit}` : ''}</div>
                            <div className="src">{e.display}</div>
                          </button>
                        )))}
                      </div>
                    </div>
                  )}
                  {entries.filter((e) => e.category !== 'activity').map((e) => (
                    <div className="entry" key={e.id}>
                      <div className="title">
                        {e.display}
                        <span className="cat">{CATEGORY_LABEL[e.category]}</span>
                        {e.documentIds.length > 1 && !e.conflict && <span className="badge">Same in {e.documentIds.length} documents</span>}
                        {e.conflict && <span className="badge differ">Sources differ — both shown</span>}
                      </div>
                      <div className="values">
                        {e.values.map((v) => (
                          <button key={v.fieldId} className="value" onClick={() => props.onSelect({ kind: 'value', entry: e, value: v })}>
                            <div className="num">{v.value}{v.unit ? <span style={{ fontWeight: 400, fontSize: 14 }}> {v.unit}</span> : null}</div>
                            <div className="src">{v.sourceName} · {DOC_TYPE[passport.documents.find((d) => d.id === v.documentId)?.type ?? ''] ?? 'document'}</div>
                            {v.labelAsPrinted !== e.display && <div className="range">printed as “{v.labelAsPrinted}”</div>}
                            {v.referenceRangeText && <div className="range">Range as printed: {v.referenceRangeText}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      {shared.length > 0 && (
        <section className="card concepts">
          <h2>Same measure, several sources</h2>
          <p className="sub">Measures that appear under different names or from different sources, lined up as one.</p>
          <ul>
            {shared.map((x) => (
              <li key={x.conceptKey}>
                <strong>{x.display}</strong> — {x.entryCount} {x.entryCount === 1 ? 'entry' : 'entries'} from {x.sources.join(', ')}
                <div className="printed">Printed as: {x.labelsAsPrinted.map((l) => `“${l}”`).join(', ')}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Atlas({ passport }: { passport: Passport }) {
  const [muse, setMuse] = useState<{ status: 'idle' | 'loading' | 'generated' | 'unavailable' | 'failed'; image?: string; reason?: string; label?: string }>({ status: 'idle' });
  const docs = passport.documents;
  const start = passport.coverage.dateSpan.start;
  const end = passport.coverage.dateSpan.end;
  const toMonths = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
  const m0 = start ? toMonths(start) : 0;
  const m1 = end ? Math.max(toMonths(end), m0 + 1) : m0 + 1;
  const W = 1000, laneH = 46, top = 30, left = 230, right = 20;
  const H = top + docs.length * laneH + 34;
  const x = (d: string) => left + ((toMonths(d) - m0 + (d.length > 7 ? (Number(d.slice(8, 10)) - 1) / 31 : 0.5)) / (m1 - m0 + 1)) * (W - left - right);

  const perDoc = docs.map((doc) => {
    const points = new Map<string, number>();
    for (const e of passport.entries) for (const v of e.values) if (v.documentId === doc.id) points.set(e.date, (points.get(e.date) ?? 0) + 1);
    const held = passport.quarantined.filter((q) => q.documentId === doc.id).length;
    return { doc, points: [...points], held };
  });
  const years: number[] = [];
  for (let y = Math.floor(m0 / 12); y <= Math.floor(m1 / 12); y++) years.push(y);

  const generate = async () => {
    setMuse({ status: 'loading' });
    const summary = {
      sources: perDoc.map((p) => ({
        name: p.doc.sourceName ?? p.doc.filename,
        type: p.doc.type,
        entries: p.points.reduce((n, [, c]) => n + c, 0),
        start: p.points.map(([d]) => d).sort()[0] ?? null,
        end: p.points.map(([d]) => d).sort().at(-1) ?? null,
      })),
      start,
      end,
      total: passport.coverage.entries,
    };
    try {
      const res = await fetch('/api/atlas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(summary) });
      const json = (await res.json()) as { status: 'generated' | 'unavailable' | 'failed'; image?: string; reason?: string; label?: string };
      setMuse(json);
    } catch {
      setMuse({ status: 'failed', reason: 'network' });
    }
  };

  return (
    <section className="card atlas">
      <h2>Record Atlas</h2>
      <p className="sub">The shape of the record: one lane per source, one mark per dated entry, across the full span. Hollow marks: items held for review.</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${docs.length} sources from ${fmtDate(start)} to ${fmtDate(end)}`}>
        {years.map((y) => {
          const d = `${y}-01`;
          const xx = toMonths(d) < m0 ? left : x(d);
          return (
            <g key={y}>
              <line x1={xx} x2={xx} y1={top - 8} y2={H - 26} stroke="var(--line)" />
              <text x={xx + 4} y={H - 10} fontSize="13" fill="var(--muted)">{y}</text>
            </g>
          );
        })}
        {perDoc.map((p, i) => {
          const cy = top + i * laneH + laneH / 2;
          const color = i % 2 === 0 ? 'var(--gold)' : 'var(--emerald)';
          return (
            <g key={p.doc.id}>
              <text x={0} y={cy - 4} fontSize="14" fill="var(--ink)">{(p.doc.sourceName ?? p.doc.filename).slice(0, 30)}</text>
              <text x={0} y={cy + 13} fontSize="11" fill="var(--muted)">{p.doc.type.replace('_', ' ')}</text>
              <line x1={left} x2={W - right} y1={cy} y2={cy} stroke="var(--line)" strokeDasharray="2 4" />
              {p.points.map(([d, n]) => (
                <circle key={d} cx={x(d)} cy={cy} r={Math.min(3.5 + Math.sqrt(n) * 2.2, 12)} fill={color} fillOpacity={0.75} />
              ))}
              {Array.from({ length: p.held }).map((_, k) => (
                <circle key={`h${k}`} cx={W - right - 8 - k * 14} cy={cy - 14} r={5} fill="none" stroke="var(--slate)" strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="museslot">
        <span>
          <strong>Muse Image Atlas.</strong>{' '}
          {muse.status === 'idle' && 'An illustrated atlas generated by Muse Image from the record’s structure only (sources, counts, span) — never from values.'}
          {muse.status === 'loading' && 'Generating with Muse Image…'}
          {muse.status === 'generated' && `Generated by ${muse.label}.`}
          {muse.status === 'unavailable' && `Not generated — Muse Image is ${fallbackReason(muse.reason ?? null).toLowerCase() || 'not configured'}. The map above is drawn by code.`}
          {muse.status === 'failed' && `Not generated — the Muse Image call did not complete (${muse.reason}). The map above is drawn by code.`}
        </span>
        {muse.status !== 'generated' && <button className="btn small ghost" onClick={generate} disabled={muse.status === 'loading'}>Generate with Muse Image</button>}
      </div>
      {muse.image && <img src={muse.image} alt="Record Atlas generated by Muse Image from the record’s structure" />}
    </section>
  );
}

function SourceSheet({ passport, selection, onClose }: { passport: Passport; selection: Selection; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const held = selection.kind === 'held' ? passport.quarantined[selection.index]! : null;
  const value = selection.kind === 'value' ? selection.value : null;
  const documentId = held?.documentId ?? value!.documentId;
  const spanIds = held?.spanIds ?? value!.spanIds;
  const doc = passport.documents.find((d) => d.id === documentId);
  const docSpans = passport.spans.filter((s) => s.documentId === documentId && s.locator.column === undefined);
  const cited = new Set(spanIds.map((id) => id.replace(/:c\d+$/, '')));
  const indexes = docSpans.map((s, i) => (cited.has(s.id) ? i : -1)).filter((i) => i >= 0);
  const show = new Set<number>();
  for (const i of indexes) for (let k = Math.max(0, i - 2); k <= Math.min(docSpans.length - 1, i + 2); k++) show.add(k);
  const shown = [...show].sort((a, b) => a - b);
  const citedSpans = passport.spans.filter((s) => spanIds.includes(s.id));

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Source" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
          <div>
            <div className="cat" style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{held ? 'Held for review' : 'Verified fact'}</div>
            <h3>{held ? held.label : selection.kind === 'value' ? selection.entry.display : ''}</h3>
          </div>
          <button className="btn small ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <dl>
          <dt>Value</dt><dd>{(held ? held.value : value!.value) ?? '—'} {(held ? held.unit : value!.unit) ?? ''}</dd>
          {value && <><dt>Printed as</dt><dd>{value.labelAsPrinted}</dd></>}
          <dt>Date as printed</dt><dd>{(held ? held.dateAsPrinted : value!.dateAsPrinted) ?? '—'}</dd>
          {value?.referenceRangeText && <><dt>Range as printed</dt><dd>{value.referenceRangeText}</dd></>}
          <dt>Source</dt><dd>{value?.sourceName ?? doc?.sourceName ?? '—'}</dd>
          <dt>Document</dt><dd>{doc?.filename}</dd>
          <dt>Location</dt><dd>{citedSpans.length ? citedSpans.map(locatorText).join('; ') : 'No source span'}</dd>
          {value && <><dt>Extracted by</dt><dd>{value.extractor === 'muse-spark-open' ? 'Muse Spark Open (Baseten)' : 'Deterministic parser (fallback)'}</dd></>}
          {held && <><dt>Held because</dt><dd>{held.reasonLabel}: {held.detail}</dd></>}
        </dl>
        <div className="excerpt" aria-label="Source excerpt">
          {shown.length === 0 && <div>No source text is linked to this item.</div>}
          {shown.map((i, k) => {
            const s = docSpans[i]!;
            const gap = k > 0 && i !== shown[k - 1]! + 1;
            return (
              <div key={s.id} className={cited.has(s.id) ? 'hit' : s.ambiguity ? 'amb' : ''}>
                {gap ? '⋯\n' : ''}<span className="loc">{shortLoc(s)}</span>{s.rawText}
              </div>
            );
          })}
        </div>
        <p className="sub" style={{ marginTop: 10 }}>Highlighted lines are the exact source text this {held ? 'item cites' : 'fact was transcribed from'}.</p>
      </div>
    </div>
  );
}
