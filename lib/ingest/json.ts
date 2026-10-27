// Wearable JSON parsing with exact source offsets: every leaf value keeps its JSON pointer,
// its line number and the raw text exactly as written in the file.

import { decodeText, describeDocument, isoDateFrom, statusFor } from './document.ts';
import type { InputFile, JsonLeaf, JsonStructure, ParsedDocument, ParsedSpan, ParseIssue } from '../types.ts';

class JsonLocError extends Error {}

interface Leaf {
  pointer: string;
  start: number;
  end: number;
  value: string | number | boolean | null;
}

function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function parseWithLocations(text: string): { root: unknown; leaves: Leaf[] } {
  const leaves: Leaf[] = [];
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] ?? '')) i++; };
  const fail = (msg: string): never => { throw new JsonLocError(`${msg} at offset ${i}`); };

  const parseString = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (text[i] !== '"') fail('Unterminated string');
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };

  const parseValue = (pointer: string): unknown => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj: Record<string, unknown> = {};
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('Expected object key');
        const key = parseString();
        ws();
        if (text[i] !== ':') fail('Expected ":"');
        i++;
        obj[key] = parseValue(`${pointer}/${escapePointer(key)}`);
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return obj; }
        fail('Expected "," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const arr: unknown[] = [];
      ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(parseValue(`${pointer}/${arr.length}`));
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return arr; }
        fail('Expected "," or "]"');
      }
    }
    const start = i;
    let value: string | number | boolean | null;
    if (c === '"') {
      value = parseString();
    } else {
      const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
      if (!m) fail('Unexpected token');
      i += m![0].length;
      value = JSON.parse(m![0]) as number | boolean | null;
    }
    leaves.push({ pointer, start, end: i, value });
    return value;
  };

  const root = parseValue('');
  ws();
  if (i < text.length) fail('Trailing content');
  return { root, leaves };
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let k = 0; k < offset; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

export function parseJson(file: InputFile): ParsedDocument {
  const document = describeDocument(file, 'wearable_json');
  const issues: ParseIssue[] = [];
  const spans: ParsedSpan[] = [];
  const { text } = decodeText(file.bytes);

  let parsed: { root: unknown; leaves: Leaf[] };
  try {
    parsed = parseWithLocations(text);
  } catch (err) {
    issues.push({ severity: 'error', code: 'json_invalid', message: err instanceof JsonLocError ? err.message : 'Invalid JSON.' });
    return { document, status: 'failed', rawText: text, structure: null, spans, issues };
  }

  const leaves: JsonLeaf[] = parsed.leaves.map((leaf) => {
    const line = lineAt(text, leaf.start);
    const spanId = `${document.id}:j${leaf.pointer}`;
    spans.push({ id: spanId, documentId: document.id, locator: { pointer: leaf.pointer, line }, rawText: text.slice(leaf.start, leaf.end), ambiguity: null });
    return { pointer: leaf.pointer, line, spanId, value: leaf.value };
  });

  // Wearable aggregates: a record whose date key is null cannot anchor its metrics in time.
  const root = parsed.root as Record<string, unknown> | null;
  const records = Array.isArray(root?.records) ? (root.records as Record<string, unknown>[]) : [];
  records.forEach((rec, idx) => {
    const dateKey = ['month', 'date', 'day', 'week'].find((k) => k in rec);
    if (!dateKey || rec[dateKey] !== null) return;
    const prefix = `${document.id}:j/records/${idx}/`;
    for (const span of spans) {
      if (span.id.startsWith(prefix)) {
        span.ambiguity = { reason: 'record_missing_date', detail: `records[${idx}].${dateKey} is null.` };
      }
    }
  });

  const source = root?.source as Record<string, unknown> | undefined;
  document.sourceName = typeof source?.device === 'string' ? source.device : null;
  document.date = typeof root?.exported_at === 'string' ? isoDateFrom(root.exported_at) : null;
  const structure: JsonStructure = { kind: 'json_tree', root: parsed.root, leaves };
  return { document, status: statusFor(issues, spans), rawText: text, structure, spans, issues };
}
