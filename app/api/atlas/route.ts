// POST /api/atlas — Record Atlas via Muse Image. The prompt is built only from the record's
// structure (source names, types, entry counts, date span) — never from values.

import { atlasPrompt } from '../../../lib/agent/prompts.ts';
import { errorCategory, museImageClient } from '../../../lib/models/clients.ts';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface AtlasRequest {
  sources?: { name?: unknown; type?: unknown; entries?: unknown; start?: unknown; end?: unknown }[];
  start?: unknown;
  end?: unknown;
  total?: unknown;
}

const s = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : null);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as AtlasRequest;
  const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 12).map((x) => ({
    name: s(x.name) ?? 'Source',
    type: s(x.type, 20) ?? 'record',
    entries: n(x.entries),
    start: s(x.start, 10),
    end: s(x.end, 10),
  }));
  let client;
  try {
    client = museImageClient(process.env);
  } catch (err) {
    return Response.json({ status: 'unavailable', reason: errorCategory(err) });
  }
  try {
    const prompt = atlasPrompt({ sources, start: s(body.start, 10), end: s(body.end, 10), total: n(body.total) });
    const { dataUrl } = await client.generate(prompt);
    return Response.json({ status: 'generated', model: client.model, label: client.label, image: dataUrl });
  } catch (err) {
    return Response.json({ status: 'failed', reason: errorCategory(err) });
  }
}
