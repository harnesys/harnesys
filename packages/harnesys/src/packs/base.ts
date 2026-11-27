import { files, shell } from '../adapters/actions';
import type { FilesOptions } from '../adapters/actions/files-options.ts';
import type { CapabilityScope } from '../domain/pack.ts';
import { definePack } from '../domain/pack.ts';
import type { ProcessJobRecord, ProcessJobRegistry } from '../domain/process-job.ts';
import type { ThreadAttachmentPort } from '../ports/thread-attachments.ts';
import type { ThreadFileLinkPort } from '../ports/thread-file-links.ts';
import { attachFileTool } from './files/attach-file.ts';
import type { ShellOptions } from './shell/shell.ts';
import { type TerminalSessionPorts } from './shell/terminal-targets.ts';
import { terminalTools } from './shell/terminal-tools.ts';
export interface FilesPackSpec {
  root?: string;
  blocklist?: string[];
}
export interface FilesPackPorts {
  attachments?: ThreadAttachmentPort;
  links?: ThreadFileLinkPort;
  resolveScope?: () => CapabilityScope;
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
export const filesCapability = definePack<FilesPackPorts, FilesPackSpec>({
  name: 'files',
  version: '1.0.0',
  description:
    'Project files: read_file / file_read_image / write_file / edit_file / delete_file / move_file / list_dir / glob / grep / attach_file',
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
      {
        name: 'write_file',
        description:
          'Write or create text files: one path/content pair or a files batch (per-entry overwrite).',
      },
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
      {
        name: 'edit_file',
        description:
          'Exact string replace in a file (unified diff) or an edits batch (per-file counts).',
      },
      {
        name: 'delete_file',
        description:
          'Delete a file by path, a paths batch, or files matching a glob pattern. Pattern deletes are dry-run unless dry_run is false; directories need recursive: true.',
      },
      {
        name: 'move_file',
        description:
          'Move or rename a file or a moves batch. Creates the target parent directory; refuses an existing target unless overwrite: true.',
      },
      { name: 'list_dir', description: 'List directory entries under the workdir.' },
      { name: 'glob', description: 'Find files by glob pattern under the workdir.' },
      { name: 'grep', description: 'Search file contents with a regular expression.' },
      {
        name: 'attach_file',
        description:
          'Attach a file to the agent reply for the user to open from the chat: mode "copy" snapshots it as a thread attachment (generated deliverables), mode "link" references an existing thread-dir or source file in place and follows it — if the file moves or is deleted the link no longer opens.',
      },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => {
    const options = filesOptionsFromSpec(ctx.spec);
    const { attachments, links, resolveScope } = ctx.ports;
    return {
      tools: [
        ...files(options),
        ...(attachments !== undefined && links !== undefined
          ? [
              attachFileTool(
                { attachments, links, resolveScope: resolveScope ?? (() => ctx.scope) },
                options,
              ),
            ]
          : []),
      ],
    };
  },
});
export interface ShellPackPorts extends TerminalSessionPorts {
  jobs: ProcessJobRegistry;
  onPtyJob?: (record: ProcessJobRecord) => void;
  onSessionSpawned?: (record: ProcessJobRecord) => void;
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
      {
        name: 'shell',
        description: 'Run a shell command; optional background / terminal / remote target.',
      },
      {
        name: 'terminal_spawn',
        description:
          'Start a named terminal session (host, ssh or REPL) kept across calls; shared with the user in the sidebar.',
      },
      {
        name: 'terminal_write',
        description: 'Write to a shared session stdin; 0x03 = Ctrl+C, 0x04 = EOF.',
      },
      {
        name: 'terminal_read',
        description: 'Read session output (non-destructive); optional until-regex (max 30s).',
      },
      {
        name: 'terminal_kill',
        description: 'Kill a session or background job; also the user shell if user-opened.',
      },
      {
        name: 'terminal_list',
        description: 'List sessions and background jobs, including user-opened ones.',
      },
      { name: 'port_forward', description: 'Open an SSH port forward as a background job.' },
      { name: 'remote_copy', description: 'Copy files over SSH via tar pipe (push/pull).' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: [
      shell(shellOptionsFromSpec(ctx.spec), ctx.ports),
      ...terminalTools({
        jobs: ctx.ports.jobs,
        resolveOrgId: ctx.ports.resolveOrgId,
        resolveThreadId: ctx.ports.resolveThreadId,
        sshHostApproved: ctx.ports.sshHostApproved,
        onSessionSpawned: ctx.ports.onSessionSpawned,
      }),
    ],
  }),
});
