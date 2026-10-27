// Deterministic PDF text extraction: objects → page tree → content streams → positioned text → lines.
// Built for the controlled synthetic lab PDFs (Type1 fonts, plain or FlateDecode streams).
// Arbitrary real-world PDFs (CID fonts, object streams, encryption) are reported as issues, never thrown.

import { inflateSync } from 'node:zlib';
import { describeDocument, isoDateFrom, statusFor } from './document.ts';
import type {
  InputFile,
  ParsedDocument,
  ParsedSpan,
  ParseIssue,
  PdfLine,
  PdfSegment,
  PdfStructure,
  PdfTable,
  PdfTableRow,
} from '../types.ts';

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

function readObjects(src: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const streamMatch = /\bstream\r?\n/.exec(src.slice(start, start + 4096));
    const endObj = src.indexOf('endobj', start);
    if (endObj < 0) break;
    let dict = src.slice(start, endObj);
    let stream: Buffer | null = null;
    if (streamMatch && start + streamMatch.index < endObj) {
      dict = src.slice(start, start + streamMatch.index);
      const dataStart = start + streamMatch.index + streamMatch[0].length;
      const len = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict);
      let dataEnd: number;
      if (len && !len[2]) {
        dataEnd = dataStart + Number(len[1]);
      } else {
        dataEnd = src.indexOf('endstream', dataStart);
        if (src[dataEnd - 1] === '\n') dataEnd -= src[dataEnd - 2] === '\r' ? 2 : 1;
      }
      stream = Buffer.from(src.slice(dataStart, dataEnd), 'latin1');
      const endStream = src.indexOf('endstream', dataEnd);
      re.lastIndex = src.indexOf('endobj', endStream) + 6;
    } else {
      re.lastIndex = endObj + 6;
    }
    objects.set(Number(m[1]), { dict, stream });
  }
  return objects;
}

function refs(text: string): number[] {
  return [...text.matchAll(/(\d+)\s+\d+\s+R/g)].map((r) => Number(r[1]));
}

function orderedPages(objects: Map<number, PdfObject>): number[] {
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.dict));
  const rootRef = catalog?.dict.match(/\/Pages\s+(\d+)\s+\d+\s+R/)?.[1];
  if (!rootRef) return [];
  const pages: number[] = [];
  const visit = (id: number, depth: number) => {
    const obj = objects.get(id);
    if (!obj || depth > 32) return;
    if (/\/Type\s*\/Pages\b/.test(obj.dict)) {
      const kids = obj.dict.match(/\/Kids\s*\[([^\]]*)\]/)?.[1] ?? '';
      for (const kid of refs(kids)) visit(kid, depth + 1);
    } else if (/\/Type\s*\/Page\b/.test(obj.dict)) {
      pages.push(id);
    }
  };
  visit(Number(rootRef), 0);
  return pages;
}

function pageContent(objects: Map<number, PdfObject>, pageId: number, issues: ParseIssue[], pageNo: number): string {
  const dict = objects.get(pageId)?.dict ?? '';
  const contents = dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/)?.[1] ?? '';
  return refs(contents)
    .map((id) => {
      const obj = objects.get(id);
      if (!obj?.stream) return '';
      if (/\/FlateDecode\b/.test(obj.dict)) {
        try {
          return inflateSync(obj.stream).toString('latin1');
        } catch {
          issues.push({ severity: 'error', code: 'pdf_stream_inflate_failed', message: `Page ${pageNo}: content stream could not be decompressed.` });
          return '';
        }
      }
      if (/\/Filter\b/.test(obj.dict)) {
        issues.push({ severity: 'error', code: 'pdf_stream_filter_unsupported', message: `Page ${pageNo}: content stream uses an unsupported filter.` });
        return '';
      }
      return obj.stream.toString('latin1');
    })
    .join('\n');
}

type Token = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'name'; v: string } | { t: 'arr'; v: Token[] } | { t: 'op'; v: string };

function readLiteralString(s: string, i: number): [string, number] {
  let out = '';
  let depth = 1;
  i++;
  while (i < s.length && depth > 0) {
    const c = s[i]!;
    if (c === '\\') {
      const n = s[i + 1] ?? '';
      const esc: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (n in esc) {
        out += esc[n];
        i += 2;
      } else if (/[0-7]/.test(n)) {
        const oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)![0];
        out += String.fromCharCode(parseInt(oct, 8));
        i += 1 + oct.length;
      } else if (n === '\r' || n === '\n') {
        i += n === '\r' && s[i + 2] === '\n' ? 3 : 2;
      } else {
        out += n;
        i += 2;
      }
      continue;
    }
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) break;
    out += c;
    i++;
  }
  return [out, i + 1];
}

function tokenize(s: string): Token[] {
  const root: Token[] = [];
  const stack: Token[][] = [root];
  const push = (tok: Token) => stack[stack.length - 1]!.push(tok);
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (c === '%') {
      while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++;
    } else if (c === '(') {
      const [str, next] = readLiteralString(s, i);
      push({ t: 'str', v: str });
      i = next;
    } else if (c === '<' && s[i + 1] === '<') {
      // Inline dictionaries (e.g. marked-content properties) carry no text; skip them.
      let depth = 0;
      while (i < s.length) {
        if (s.startsWith('<<', i)) { depth++; i += 2; }
        else if (s.startsWith('>>', i)) { depth--; i += 2; if (depth === 0) break; }
        else i++;
      }
    } else if (c === '<') {
      const end = s.indexOf('>', i);
      const hex = s.slice(i + 1, end).replace(/\s/g, '');
      const padded = hex.length % 2 ? `${hex}0` : hex;
      push({ t: 'str', v: Buffer.from(padded, 'hex').toString('latin1') });
      i = end + 1;
    } else if (c === '[') {
      stack.push([]);
      i++;
    } else if (c === ']') {
      const arr = stack.length > 1 ? stack.pop()! : [];
      push({ t: 'arr', v: arr });
      i++;
    } else if (c === '/') {
      const m = /^\/[^\s/<>[\]()%{}]*/.exec(s.slice(i))!;
      push({ t: 'name', v: m[0].slice(1) });
      i += m[0].length;
    } else {
      const num = /^[+-]?(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (num) {
        push({ t: 'num', v: Number(num[0]) });
        i += num[0].length;
      } else {
        const op = /^[^\s/<>[\]()%{}]+/.exec(s.slice(i));
        if (!op) { i++; continue; }
        push({ t: 'op', v: op[0] });
        i += op[0].length;
      }
    }
  }
  return root;
}

interface PositionedText {
  x: number;
  y: number;
  size: number;
  text: string;
}

function extractPositionedText(content: string): PositionedText[] {
  const out: PositionedText[] = [];
  let lineX = 0, lineY = 0, x = 0, y = 0, size = 10, leading = 0;
  let operands: Token[] = [];
  const nums = () => operands.filter((o): o is { t: 'num'; v: number } => o.t === 'num').map((o) => o.v);
  const emit = (text: string) => {
    if (text.length === 0) return;
    out.push({ x, y, size, text });
    x += text.length * size * 0.5; // approximate advance for ordering only
  };
  const newLine = (dx: number, dy: number) => {
    lineX += dx; lineY += dy; x = lineX; y = lineY;
  };
  for (const tok of tokenize(content)) {
    if (tok.t !== 'op') { operands.push(tok); continue; }
    const n = nums();
    switch (tok.v) {
      case 'BT': lineX = lineY = x = y = 0; break;
      case 'Tf': size = n[0] ?? size; break;
      case 'TL': leading = n[0] ?? leading; break;
      case 'Td': newLine(n[0] ?? 0, n[1] ?? 0); break;
      case 'TD': leading = -(n[1] ?? 0); newLine(n[0] ?? 0, n[1] ?? 0); break;
      case 'Tm': lineX = x = n[4] ?? 0; lineY = y = n[5] ?? 0; break;
      case 'T*': newLine(0, -leading); break;
      case 'Tj': emit(operands.find((o) => o.t === 'str')?.v as string ?? ''); break;
      case "'":
      case '"': newLine(0, -leading); emit(operands.filter((o) => o.t === 'str').map((o) => o.v).join('')); break;
      case 'TJ': {
        const arr = operands.find((o) => o.t === 'arr');
        let text = '';
        for (const part of arr?.t === 'arr' ? arr.v : []) {
          if (part.t === 'str') text += part.v;
          else if (part.t === 'num' && part.v < -200) text += ' '; // large negative kerning = visual gap
        }
        emit(text);
        break;
      }
    }
    operands = [];
  }
  return out;
}

function groupLines(items: PositionedText[]): { y: number; segments: PdfSegment[]; text: string }[] {
  const rows: { y: number; items: PositionedText[] }[] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.map((r) => {
    const sorted = r.items.sort((a, b) => a.x - b.x);
    let text = '';
    sorted.forEach((item, idx) => {
      if (idx > 0) {
        const prev = sorted[idx - 1]!;
        const gap = item.x - (prev.x + prev.text.length * prev.size * 0.5);
        text += gap > prev.size * 1.5 ? '  ' : gap > prev.size * 0.2 ? ' ' : '';
      }
      text += item.text;
    });
    return { y: r.y, segments: sorted.map((s) => ({ x: s.x, text: s.text })), text };
  });
}

/** Table = a header line whose segments name the columns, followed by rows aligned to those columns. */
function detectTables(pages: PdfStructure['pages']): PdfTable[] {
  const tables: PdfTable[] = [];
  for (const { page, lines } of pages) {
    for (let i = 0; i < lines.length; i++) {
      const header = lines[i]!;
      if (header.segments.length < 3 || header.segments[0]!.text !== 'Test') continue;
      const columns = header.segments.map((s) => ({ name: s.text, x: s.x }));
      const rows: PdfTableRow[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j]!;
        const cells: Record<string, string | null> = Object.fromEntries(columns.map((c) => [c.name, null]));
        let aligned = line.segments.length >= 2;
        for (const seg of line.segments) {
          const col = columns.find((c) => Math.abs(c.x - seg.x) <= 6);
          if (!col) { aligned = false; break; }
          cells[col.name] = seg.text;
        }
        if (!aligned || cells[columns[0]!.name] === null) break;
        rows.push({ page, line: line.line, spanId: line.spanId, cells });
      }
      tables.push({ page, headerLine: header.line, columns, rows });
    }
  }
  return tables;
}

export function parsePdf(file: InputFile): ParsedDocument {
  const document = describeDocument(file, 'lab_pdf');
  const issues: ParseIssue[] = [];
  const spans: ParsedSpan[] = [];
  const src = Buffer.from(file.bytes).toString('latin1');

  if (!src.startsWith('%PDF-')) {
    issues.push({ severity: 'error', code: 'pdf_bad_header', message: 'File does not start with a PDF header.' });
    return { document, status: 'failed', rawText: '', structure: null, spans, issues };
  }
  if (/\/Encrypt\b/.test(src)) {
    issues.push({ severity: 'error', code: 'pdf_encrypted', message: 'Encrypted PDFs are not supported.' });
    return { document, status: 'failed', rawText: '', structure: null, spans, issues };
  }

  const objects = readObjects(src);
  const pageIds = orderedPages(objects);
  if (pageIds.length === 0) {
    issues.push({ severity: 'error', code: 'pdf_no_pages', message: 'No page tree found (object streams are not supported yet).' });
  }

  const pages: PdfStructure['pages'] = pageIds.map((pageId, idx) => {
    const page = idx + 1;
    const grouped = groupLines(extractPositionedText(pageContent(objects, pageId, issues, page)));
    if (grouped.length === 0) {
      issues.push({ severity: 'warning', code: 'pdf_page_no_text', message: `Page ${page}: no extractable text (may be scanned).` });
    }
    const lines: PdfLine[] = grouped.map((g, i) => {
      const line = i + 1;
      const spanId = `${document.id}:p${page}:l${line}`;
      spans.push({ id: spanId, documentId: document.id, locator: { page, line }, rawText: g.text, ambiguity: null });
      return { line, y: g.y, text: g.text, spanId, segments: g.segments };
    });
    return { page, lines };
  });

  const tables = detectTables(pages);
  for (const table of tables) {
    const valueColumn = table.columns[1]!.name;
    for (const row of table.rows) {
      if (row.cells[valueColumn] === null) {
        const span = spans.find((s) => s.id === row.spanId)!;
        span.ambiguity = {
          reason: 'table_row_missing_value',
          detail: `Row "${row.cells[table.columns[0]!.name]}" has no cell under "${valueColumn}".`,
        };
      }
    }
  }

  const allLines = pages.flatMap((p) => p.lines);
  document.sourceName = allLines[0]?.text ?? null;
  const reportLine = allLines.find((l) => /Report date:/i.test(l.text));
  document.date = reportLine ? isoDateFrom(reportLine.text.replace(/.*Report date:/i, '')) : null;

  const rawText = pages.map((p) => p.lines.map((l) => l.text).join('\n')).join('\n\f\n');
  return { document, status: statusFor(issues, spans), rawText, structure: { kind: 'pdf_text', pages, tables }, spans, issues };
}
