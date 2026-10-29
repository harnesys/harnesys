import { files, shell } from '../adapters/actions';
import type { FilesOptions } from '../adapters/actions/files-options.ts';
import { definePack } from '../domain/pack.ts';
import type { ProcessJobRecord, ProcessJobRegistry } from '../domain/process-job.ts';
import { processTools } from './shell/process-tools.ts';
import type { ShellOptions } from './shell/shell.ts';
export interface FilesPackSpec {
  root?: string;
  blocklist?: string[];
}
export interface ShellPackSpec {
  timeout?: number;
  allowlist?: string[];
  blocklist?: string[];
}
function filesOptionsFromSpec(spec: FilesPackSpec): FilesOptions {
  const root =
    typeof spec.root === 'string' && spec.root.trim() !== '' ? spec.root.trim() : undefined;
  const blocklist = stringList(spec.blocklist);
  return {
    ...(root !== undefined ? { root } : {}),
    ...(blocklist !== undefined ? { blocklist } : {}),
  };
}
function shellOptionsFromSpec(spec: ShellPackSpec): ShellOptions {
  const timeout =
    typeof spec.timeout === 'number' && Number.isFinite(spec.timeout) ? spec.timeout : undefined;
  const allowlist = stringList(spec.allowlist);
  const blocklist = stringList(spec.blocklist);
  return {
    ...(timeout !== undefined ? { timeout } : {}),
    ...(allowlist !== undefined ? { allowlist } : {}),
    ...(blocklist !== undefined ? { blocklist } : {}),
  };
}
function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );
  return list.length > 0 ? list : undefined;
}
export const filesCapability = definePack<Record<string, unknown>, FilesPackSpec>({
  name: 'files',
  version: '1.0.0',
  description:
    'Project files: read_file / file_read_image / write_file / edit_file / list_dir / glob / grep',
  icon: 'files',
  specSchema: {
    type: 'object',
    properties: {
      root: { type: 'string' },
      blocklist: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  meta: {
    tools: [
      {
        name: 'read_file',
        description:
          'Read a text file with numbered lines. Omitting offset/limit returns the whole file when it fits, otherwise the first 400 lines. offset is the 1-based start line; limit is the max lines (capped at 2000). If truncated is true, more lines remain.',
      },
      {
        name: 'file_read_image',
        description:
          'Read an image file (png, jpeg, webp) and show it to the model in the next turn. Oversized files are downscaled automatically.',
      },
      {
        name: 'extract_file_text',
        description:
          'Extract text from PDF (text layer), DOCX, XLSX/XLS (sheets as Markdown tables) and CSV documents. Clear error for scanned PDFs and unsupported formats.',
      },
      { name: 'write_file', description: 'Write or create a text file under the workdir.' },
      {
        name: 'write_xlsx',
        description:
          'Create an Excel workbook (.xlsx) with multiple sheets, bold headers and column widths.',
      },
      {
        name: 'write_docx',
        description:
          'Create a Word document (.docx) from blocks: headings, paragraphs, bullets, tables, page breaks.',
      },
      { name: 'edit_file', description: 'Exact string replace in a file. Returns a unified diff.' },
      { name: 'list_dir', description: 'List directory entries under the workdir.' },
      { name: 'glob', description: 'Find files by glob pattern under the workdir.' },
      { name: 'grep', description: 'Search file contents with a regular expression.' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({ tools: files(filesOptionsFromSpec(ctx.spec)) }),
});
export interface ShellPackPorts {
  jobs: ProcessJobRegistry;
  onPtyJob?: (record: ProcessJobRecord) => void;
  resolveOrgId?: () => string | undefined;
}
export const shellCapability = definePack<ShellPackPorts, ShellPackSpec>({
  name: 'shell',
  version: '1.0.0',
  description: 'Thread workdir shell command: shell',
  icon: 'shell',
  specSchema: {
    type: 'object',
    properties: {
      timeout: { type: 'number', minimum: 1, maximum: 600000 },
      allowlist: { type: 'array', items: { type: 'string' } },
      blocklist: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  meta: {
    tools: [
      { name: 'shell', description: 'Run a shell command; optional background / terminal.' },
      { name: 'process_poll', description: 'Read output and status of a process job.' },
      { name: 'process_kill', description: 'Kill a process job started by shell.' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: [shell(shellOptionsFromSpec(ctx.spec), ctx.ports), ...processTools(ctx.ports.jobs)],
  }),
});
