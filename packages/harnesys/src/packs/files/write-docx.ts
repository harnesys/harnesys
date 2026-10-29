import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { withPathLock } from './path-lock.ts';

export type DocxBlock =
  | { type: 'heading'; text: string; level?: number }
  | { type: 'paragraph'; text: string; bold?: boolean }
  | { type: 'bullet'; text: string }
  | { type: 'table'; rows: string[][]; headerRow?: boolean; columnWidths?: number[] }
  | { type: 'pageBreak' };

export interface WriteDocxInput {
  path: string;
  overwrite?: boolean;
  blocks: DocxBlock[];
}

export function writeDocxTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('write_docx', {
    group: 'files',
    description:
      'Create a Word (.docx) document from an ordered list of blocks: headings (levels 1-6), paragraphs, bullet items, tables (first row bold as header unless headerRow is false, optional columnWidths) and page breaks. Use for proposals, reports, contracts and any document a human will open in Word. Paths starting with `thread:` resolve inside the thread file directory.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        overwrite: { type: 'boolean' },
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['heading', 'paragraph', 'bullet', 'table', 'pageBreak'],
              },
              text: { type: 'string' },
              level: { type: 'integer', minimum: 1, maximum: 6 },
              bold: { type: 'boolean' },
              rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              headerRow: { type: 'boolean' },
              columnWidths: { type: 'array', items: { type: 'number' } },
            },
            required: ['type'],
          },
        },
      },
      required: ['path', 'blocks'],
    },
    gate: fileAccessGate('edit', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as WriteDocxInput;
      if (parsed.blocks.length === 0) {
        throw new Error('At least one block is required.');
      }
      const absolute = resolveFileTarget(ctx, parsed.path, 'edit', options);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      return withPathLock(absolute, async () => {
        const file = Bun.file(absolute);
        const exists = await file.exists();
        if (exists && parsed.overwrite === false) {
          throw new Error(`File exists and overwrite is false: ${parsed.path}`);
        }
        const document = new Document({
          sections: [{ children: renderBlocks(parsed.blocks) }],
        });
        await mkdir(path.dirname(absolute), { recursive: true });
        const buffer = await Packer.toBuffer(document);
        await Bun.write(absolute, buffer);
        return {
          path: parsed.path,
          bytes: buffer.byteLength,
          blocks: parsed.blocks.length,
          created: !exists,
        };
      });
    },
  });
}

function renderBlocks(blocks: DocxBlock[]): (Paragraph | Table)[] {
  return blocks.map((block) => {
    switch (block.type) {
      case 'heading': {
        const level = Math.min(Math.max(block.level ?? 1, 1), 6);
        const headings = [
          HeadingLevel.HEADING_1,
          HeadingLevel.HEADING_2,
          HeadingLevel.HEADING_3,
          HeadingLevel.HEADING_4,
          HeadingLevel.HEADING_5,
          HeadingLevel.HEADING_6,
        ];
        return new Paragraph({ text: block.text, heading: headings[level - 1] });
      }
      case 'paragraph':
        return new Paragraph({
          children: [new TextRun({ text: block.text, bold: block.bold })],
        });
      case 'bullet':
        return new Paragraph({ text: block.text, bullet: { level: 0 } });
      case 'pageBreak':
        return new Paragraph({ children: [new PageBreak()] });
      case 'table':
        return renderTable(block);
      default:
        throw new Error(`Unknown block type`);
    }
  });
}

function renderTable(block: Extract<DocxBlock, { type: 'table' }>): Table {
  if (block.rows.length === 0) {
    throw new Error('Table needs at least one row.');
  }
  const headerRow = block.headerRow !== false;
  const rows = block.rows.map(
    (cells, index) =>
      new TableRow({
        children: cells.map(
          (text) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text, bold: headerRow && index === 0 })],
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    rows,
    ...(block.columnWidths ? { columnWidths: block.columnWidths } : {}),
  });
}
