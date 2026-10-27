// Pipeline orchestration: ingest → extract (model, falling back to parsers) → timeline.
// TODO(Wed/Thu): insert normalize → resolve → verify between extract and timeline.

import { extractWithFallback, type ExtractionResult } from '../agent/extract.ts';
import type { ExtractionStage } from '../agent/types.ts';
import { ingestFiles } from '../ingest/index.ts';
import { buildTimeline, type ParserOnlyTimeline } from './timeline.ts';
import type { InputFile, ParsedDocument } from '../types.ts';

export interface PipelineRun {
  documents: ParsedDocument[];
  extraction: ExtractionResult[];
  timeline: ParserOnlyTimeline;
}

export async function runPipeline(files: InputFile[], extractor?: ExtractionStage): Promise<PipelineRun> {
  const documents = ingestFiles(files);
  const extraction = await Promise.all(documents.filter((d) => d.status !== 'failed').map((d) => extractWithFallback(d, extractor)));
  const timeline = buildTimeline(documents, extraction.flatMap((e) => e.fields));
  return { documents, extraction, timeline };
}
