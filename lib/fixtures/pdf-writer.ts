// Minimal deterministic PDF writer for the synthetic lab report.
// No timestamps or random ids are written, so identical input yields identical bytes.

import { deflateSync } from 'node:zlib';

export interface PdfTextItem {
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
  /** Plain string → `Tj`. Array → `TJ` with kerning numbers (thousandths of an em), as real PDFs often emit. */
  text: string | (string | number)[];
}

export interface PdfPageSpec {
  items: PdfTextItem[];
  /** FlateDecode the content stream, as most real-world PDFs do. */
  compress?: boolean;
}

function escapePdfString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function contentStream(items: PdfTextItem[]): string {
  return items
    .map((item) => {
      const font = item.bold ? 'F2' : 'F1';
      const size = item.size ?? 10;
      const show =
        typeof item.text === 'string'
          ? `(${escapePdfString(item.text)}) Tj`
          : `[${item.text.map((p) => (typeof p === 'number' ? String(p) : `(${escapePdfString(p)})`)).join(' ')}] TJ`;
      return `BT /${font} ${size} Tf ${item.x} ${item.y} Td ${show} ET`;
    })
    .join('\n');
}

export function writePdf(pages: PdfPageSpec[], title: string): Buffer {
  // Object layout: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then (page, content) pairs.
  const objects: Buffer[] = [];
  const pageIds = pages.map((_, i) => 6 + i * 2);

  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  objects.push(Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`, 'latin1'));
  objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'));
  objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1'));
  objects.push(Buffer.from(`<< /Title (${escapePdfString(title)}) /Producer (Unus synthetic fixture generator) >>`, 'latin1'));

  pages.forEach((page, i) => {
    const contentId = pageIds[i]! + 1;
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
        'latin1',
      ),
    );
    const raw = Buffer.from(contentStream(page.items), 'latin1');
    const data = page.compress ? deflateSync(raw, { level: 9 }) : raw;
    const filter = page.compress ? ' /Filter /FlateDecode' : '';
    objects.push(
      Buffer.concat([
        Buffer.from(`<< /Length ${data.length}${filter} >>\nstream\n`, 'latin1'),
        data,
        Buffer.from('\nendstream', 'latin1'),
      ]),
    );
  });

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    chunks.push(chunk);
    offset += chunk.length;
  });

  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>`,
    'startxref',
    String(offset),
    '%%EOF',
    '',
  ].join('\n');
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}
