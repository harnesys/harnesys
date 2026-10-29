import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

const MAX_TEXT_CHARS = 200_000;

const FORMAT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
};

const FORMAT_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  '.csv': 'csv',
};

const SUPPORTED_FORMATS = 'PDF (.pdf), Word (.docx), Excel (.xlsx, .xls), CSV (.csv)';
const UNSUPPORTED_HINT =
  'Use read_file for text/code files or file_read_image for images. Legacy Word .doc is not supported: save as .docx first.';

export interface ExtractFileTextOutput {
  fileName: string;
  format: string;
  content: string;
  truncated: boolean;
}

export function detectDocumentFormat(mimeType: string, fileName: string): string | undefined {
  const byMime = FORMAT_BY_MIME[mimeType];
  if (byMime) {
    return byMime;
  }
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) {
    return undefined;
  }
  return FORMAT_BY_EXTENSION[fileName.slice(dot).toLowerCase()];
}

export function extractFileTextTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('extract_file_text', {
    group: 'files',
    description:
      'Extract text from a document file. Supports PDF (text layer), Word (.docx), Excel (.xlsx, .xls; every sheet as a Markdown table) and CSV. Returns plain text or Markdown. Fails with a clear error for scanned PDFs without a text layer and for unsupported formats. Use read_file for text/code files and file_read_image for images. Paths starting with `thread:` resolve inside the thread file directory, e.g. `thread:attachments/invoice.pdf` for a file uploaded to this thread.',
    operations: ['fs.read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    gate: fileAccessGate('read', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as { path: string };
      const absolute = resolveFileTarget(ctx, parsed.path, 'read', options);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      const file = Bun.file(absolute);
      if (!(await file.exists())) {
        throw new Error(`File not found: ${parsed.path}`);
      }
      const format = detectDocumentFormat(file.type, parsed.path);
      if (!format) {
        throw new Error(
          `"${parsed.path}" (${file.type || 'unknown type'}) is not a supported document format. Supported: ${SUPPORTED_FORMATS}. ${UNSUPPORTED_HINT}`,
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const content = await extractText(format, buffer);
      const truncated = content.length > MAX_TEXT_CHARS;
      const output: ExtractFileTextOutput = {
        fileName: parsed.path,
        format,
        content: truncated ? content.slice(0, MAX_TEXT_CHARS) : content,
        truncated,
      };
      return output;
    },
  });
}

async function extractText(format: string, buffer: Buffer): Promise<string> {
  switch (format) {
    case 'pdf':
      return extractPdf(buffer);
    case 'docx':
      return extractDocx(buffer);
    case 'xlsx':
    case 'xls':
      return extractSpreadsheet(buffer);
    case 'csv':
      return extractCsv(buffer);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const result = await parser.getText();
    const meaningful = result.text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim();
    if (meaningful === '') {
      throw new Error(
        'PDF has no text layer (likely a scan or image-only pages). OCR is required; no text could be extracted.',
      );
    }
    return result.text;
  } finally {
    parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ buffer });
  const text = htmlTablesToMarkdown(result.value);
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new Error('DOCX contains no text content.');
  }
  return text;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (match) => ENTITIES[match] ?? match);
}

export function htmlTablesToMarkdown(html: string): string {
  const withTables = html.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) =>
      [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        decodeEntities((cell[1] ?? '').replace(/<[^>]+>/g, ''))
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    );
    if (rows.length === 0 || !rows[0]) {
      return '';
    }
    const header = rows[0];
    const body = rows.slice(1);
    const escapeCell = (value: string) => value.replace(/\|/g, '\\|');
    const lines = [
      `| ${header.map(escapeCell).join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...body.map((row) => `| ${header.map((_, i) => escapeCell(row[i] ?? '')).join(' | ')} |`),
    ];
    return `\n${lines.join('\n')}\n\n`;
  });
  const withBullets = withTables
    .replace(/<li[^>]*\sid="[^"]*"[^>]*>/gi, '\n')
    .replace(/<(ul|ol)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n');
  const withBreaks = withBullets.replace(/<\/(p|h[1-6]|blockquote|tr|table|ul|ol)>/gi, '\n\n');
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

async function extractSpreadsheet(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });
    parts.push(`## Sheet: ${sheetName}\n\n${toMarkdownTable(rows)}`);
  }
  const text = parts.join('\n\n').trim();
  if (text === '') {
    throw new Error('Spreadsheet contains no data.');
  }
  return text;
}

function toMarkdownTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return '(empty sheet)';
  }
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) {
    return '(empty sheet)';
  }
  const escapeCell = (value: unknown) =>
    String(value).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map((h) => escapeCell(row[h])).join(' | ')} |`),
  ];
  return lines.join('\n');
}

async function extractCsv(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('CSV contains no data.');
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('CSV contains no data.');
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  if (rows.length === 0) {
    throw new Error('CSV contains no data.');
  }
  return toMarkdownTable(rows);
}
