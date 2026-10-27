// POST /api/run — runs the Unus agent workflow and streams progress as NDJSON.
// Body: JSON {"corpus":"sample"} for the synthetic corpus, or multipart form-data with `files`.
// Uploaded files are processed in memory for this request only and are never stored.

import { generateCorpus } from '../../../lib/fixtures/corpus.ts';
import { recordRun } from '../../../lib/persistence/supabase.ts';
import { clientsFromEnv, runPipeline, type RunEvent } from '../../../lib/pipeline/run.ts';
import type { InputFile } from '../../../lib/types.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILES = 12;
const MAX_BYTES = 5 * 1024 * 1024;

async function readInput(req: Request): Promise<{ corpus: 'sample' | 'upload'; files: InputFile[] } | { error: string }> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data')) {
    const form = await req.formData();
    const entries = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (entries.length === 0) return { error: 'No files received.' };
    if (entries.length > MAX_FILES) return { error: `Up to ${MAX_FILES} files per run.` };
    if (entries.some((f) => f.size > MAX_BYTES)) return { error: 'Each file must be 5 MB or smaller.' };
    const files = await Promise.all(entries.map(async (f) => ({ filename: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    return { corpus: 'upload', files };
  }
  const body = (await req.json().catch(() => ({}))) as { corpus?: string };
  if (body.corpus !== 'sample') return { error: 'Unknown request.' };
  return { corpus: 'sample', files: generateCorpus().files.map((f) => ({ filename: f.filename, bytes: f.bytes })) };
}

export async function POST(req: Request): Promise<Response> {
  const input = await readInput(req);
  if ('error' in input) return Response.json({ error: input.error }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RunEvent | { type: 'persisted'; status: string } | { type: 'error'; message: string }) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      const t0 = performance.now();
      try {
        const passport = await runPipeline(input.files, { corpus: input.corpus, clients: clientsFromEnv(process.env), onEvent: send });
        send({ type: 'persisted', status: await recordRun(passport, performance.now() - t0, process.env) });
      } catch {
        // Privacy-safe: no file contents or stack in the response.
        send({ type: 'error', message: 'The run could not complete.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
