import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import type { FileAccessPolicy } from '../../ports/file-access.ts';
import type { ToolContext } from '../../ports/tools.ts';
import {
  detectDocumentFormat,
  extractFileTextTool,
  htmlTablesToMarkdown,
} from './extract-file-text.ts';

const allowAll: FileAccessPolicy = () => ({ decision: 'allow' });

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'harnesys-extract-text-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(cwd: string): ToolContext {
  return { cwd, paths: { allow: [], threadDir: path.join(cwd, 'thread') }, fileAccess: allowAll };
}

function writeFixture(name: string, bytes: Uint8Array | string): string {
  const target = path.join(root, name);
  writeFileSync(target, bytes);
  return target;
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makeTextPdf(text: string): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td (${pdfEscape(text)}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name: string, body: string): { local: Uint8Array; central: Uint8Array } {
  const nameBytes = new TextEncoder().encode(name);
  const raw = new TextEncoder().encode(body);
  const data = deflateRawSync(raw);
  const crc = crc32(raw);
  const localBuf = new ArrayBuffer(30 + nameBytes.length + data.length);
  const localView = new DataView(localBuf);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(8, 8, true);
  localView.setUint32(16, crc, true);
  localView.setUint32(20, data.length, true);
  localView.setUint32(24, raw.length, true);
  localView.setUint16(26, nameBytes.length, true);
  const localBytes = new Uint8Array(localBuf);
  localBytes.set(nameBytes, 30);
  localBytes.set(data, 30 + nameBytes.length);
  const centralBuf = new ArrayBuffer(46 + nameBytes.length);
  const centralView = new DataView(centralBuf);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(10, 8, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, raw.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  new Uint8Array(centralBuf).set(nameBytes, 46);
  return { local: new Uint8Array(localBuf), central: new Uint8Array(centralBuf) };
}

function makeZip(files: Record<string, string>): Uint8Array {
  const entries = Object.entries(files).map(([name, body]) => zipEntry(name, body));
  const parts: Uint8Array[] = [];
  let offset = 0;
  const centralParts: Uint8Array[] = [];
  for (const entry of entries) {
    parts.push(entry.local);
    const centralView = new DataView(entry.central.buffer);
    centralView.setUint32(42, offset, true);
    centralParts.push(entry.central);
    offset += entry.local.length;
  }
  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...parts, ...centralParts, new Uint8Array(end.buffer)]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

function makeDocx(text: string): Uint8Array {
  const paragraph = text
    .split('\n')
    .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
    .join('');
  return makeDocxBody(paragraph);
}

function makeDocxWithTable(rows: string[][]): Uint8Array {
  const [header = [], ...body] = rows;
  const cell = (value: string) => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
  const table = `<w:tbl><w:tr>${header
    .map(cell)
    .join(
      '',
    )}</w:tr>${body.map((row) => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`;
  return makeDocxBody(table);
}

function makeDocxBody(body: string): Uint8Array {
  return makeZip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  });
}

describe('detectDocumentFormat', () => {
  test('maps mime first, then extension', () => {
    expect(detectDocumentFormat('application/pdf', 'a.bin')).toBe('pdf');
    expect(
      detectDocumentFormat(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'a.bin',
      ),
    ).toBe('xlsx');
    expect(detectDocumentFormat('', 'a.PDF')).toBe('pdf');
    expect(detectDocumentFormat('', 'report.docx')).toBe('docx');
    expect(detectDocumentFormat('application/octet-stream', 'photo.png')).toBeUndefined();
    expect(detectDocumentFormat('', 'noext')).toBeUndefined();
  });
});

describe('extract_file_text tool', () => {
  test('extracts text from a PDF with a text layer', async () => {
    writeFixture('invoice.pdf', makeTextPdf('Invoice total: 42 EUR'));
    const def = extractFileTextTool();
    const result = (await def.execute({ path: path.join(root, 'invoice.pdf') }, ctx(root))) as {
      format: string;
      content: string;
      truncated: boolean;
    };
    expect(result.format).toBe('pdf');
    expect(result.content).toContain('Invoice total: 42 EUR');
    expect(result.truncated).toBe(false);
  });

  test('fails with a clear error on an empty (image-only) PDF', async () => {
    const emptyPdf = makeTextPdf('');
    writeFixture('scan.pdf', emptyPdf);
    const def = extractFileTextTool();
    await expect(def.execute({ path: path.join(root, 'scan.pdf') }, ctx(root))).rejects.toThrow(
      /no text layer/,
    );
  });

  test('extracts DOCX text', async () => {
    writeFixture('contract.docx', makeDocx('Payment terms: 30 days\nSection 2: Liability'));
    const def = extractFileTextTool();
    const result = (await def.execute({ path: path.join(root, 'contract.docx') }, ctx(root))) as {
      format: string;
      content: string;
    };
    expect(result.format).toBe('docx');
    expect(result.content).toContain('Payment terms: 30 days');
    expect(result.content).toContain('Section 2: Liability');
    expect(result.content).toContain('Payment terms: 30 days\n\nSection 2: Liability');
  });

  test('renders DOCX tables as Markdown', async () => {
    writeFixture(
      'order.docx',
      makeDocxWithTable([
        ['ITEM', 'QTY'],
        ['Books', '3'],
      ]),
    );
    const def = extractFileTextTool();
    const result = (await def.execute({ path: path.join(root, 'order.docx') }, ctx(root))) as {
      content: string;
    };
    expect(result.content).toContain('| ITEM | QTY |');
    expect(result.content).toContain('| Books | 3 |');
  });

  test('renders lists with bullet markers and blank line after tables', () => {
    const html =
      '<p>Intro</p><table><tr><td><p>H</p></td></tr><tr><td><p>v</p></td></tr></table><p>Outro</p><ul><li>first</li><li>second</li></ul><p>End</p>';
    const text = htmlTablesToMarkdown(html);
    expect(text).toContain('Intro\n\n| H |');
    expect(text).toContain('| v |\n\nOutro');
    expect(text).toContain('- first\n- second\n\nEnd');
  });

  test('keeps nested list levels on their own lines and skips footnote ids', () => {
    const nested = '<ol><li>One<ol><li>Two<ol><li>Three</li></ol></li></ol></li></ol>';
    expect(htmlTablesToMarkdown(nested)).toContain('- One\n- Two\n- Three');
    const footnote =
      '<p>Body text<sup><a href="#fn">1</a></sup></p><ol><li id="footnote-1">In paged media, footnotes appear at the bottom.</li></ol>';
    expect(htmlTablesToMarkdown(footnote)).not.toContain('- In paged media');
    expect(htmlTablesToMarkdown(footnote)).toContain('In paged media, footnotes appear');
  });

  test('extracts XLSX sheets as Markdown tables', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.json_to_sheet([
      { item: 'coffee', qty: 2, price: '3.50' },
      { item: 'tea', qty: 1, price: '2.80' },
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Order');
    const second = XLSX.utils.aoa_to_sheet([
      [1, 2],
      [3, 4],
    ]);
    XLSX.utils.book_append_sheet(book, second, 'Summary');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    writeFixture('report.xlsx', new Uint8Array(bytes));
    const def = extractFileTextTool();
    const result = (await def.execute({ path: path.join(root, 'report.xlsx') }, ctx(root))) as {
      format: string;
      content: string;
    };
    expect(result.format).toBe('xlsx');
    expect(result.content).toContain('## Sheet: Order');
    expect(result.content).toContain('| coffee | 2 | 3.50 |');
    expect(result.content).toContain('## Sheet: Summary');
  });

  test('trims cell values in spreadsheet output', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      [' Carretera ', ' $3.00 '],
      [' Hotel ', ' $9.00 '],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Padded');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    writeFixture('padded.xlsx', new Uint8Array(bytes));
    const def = extractFileTextTool();
    const result = (await def.execute({ path: path.join(root, 'padded.xlsx') }, ctx(root))) as {
      content: string;
    };
    expect(result.content).toContain('| Carretera | $3.00 |');
    expect(result.content).toContain('| Hotel | $9.00 |');
  });

  test('extracts CSV as a Markdown table and rejects unsupported types', async () => {
    writeFixture('expenses.csv', 'item,amount\nrent,1200\nfood,300');
    const def = extractFileTextTool();
    const result = (await def.execute({ path: path.join(root, 'expenses.csv') }, ctx(root))) as {
      format: string;
      content: string;
    };
    expect(result.format).toBe('csv');
    expect(result.content).toContain('| rent | 1200 |');

    const txt = writeFixture('notes.txt', 'just text');
    await expect(def.execute({ path: txt }, ctx(root))).rejects.toThrow(
      /not a supported document format[\s\S]*file_read_image/,
    );
    const doc = writeFixture('legacy.doc', 'not really a doc');
    await expect(def.execute({ path: doc }, ctx(root))).rejects.toThrow(/Legacy Word \.doc/);
    await expect(def.execute({ path: path.join(root, 'missing.pdf') }, ctx(root))).rejects.toThrow(
      'File not found',
    );
  });
});
