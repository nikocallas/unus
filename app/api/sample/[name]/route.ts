// GET /api/sample/<filename> — download one file of the synthetic sample corpus, regenerated
// deterministically from its seed (so the download is identical to the repo's fixtures).

import { generateCorpus } from '../../../../lib/fixtures/corpus.ts';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  lab_pdf: 'application/pdf',
  portal_csv: 'text/csv; charset=utf-8',
  wearable_json: 'application/json; charset=utf-8',
  visit_summary: 'text/plain; charset=utf-8',
};

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await ctx.params;
  const file = generateCorpus().files.find((f) => f.filename === name);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { 'content-type': TYPES[file.type]!, 'content-disposition': `attachment; filename="${file.filename}"` },
  });
}
