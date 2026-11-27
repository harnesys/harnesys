import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import { readFileBytes } from '../../application/attachment-reader.ts';
import { attachmentToolResultOf } from '../../application/attachment-result.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { ThreadAttachmentPort } from '../../ports/thread-attachments.ts';
import type { ThreadFileLinkPort, ThreadFileLinkRecord } from '../../ports/thread-file-links.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

export interface AttachFilePorts {
  attachments: ThreadAttachmentPort;
  links: ThreadFileLinkPort;
  resolveScope: () => CapabilityScope;
}

function linkOf(record: ThreadFileLinkRecord) {
  return record.source === 'thread'
    ? { source: 'thread', threadId: record.threadId, path: record.path }
    : {
        source: 'project',
        projectId: record.projectId,
        path: record.path,
        ...(record.worktreeId !== undefined ? { worktreeId: record.worktreeId } : {}),
      };
}

export function attachFileTool(ports: AttachFilePorts, options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('attach_file', {
    group: 'files',
    description:
      'Attach a file to your reply so the user opens it straight from the chat. Any path relative to the run root or absolute, gated by file-read access. mode "copy" (default) snapshots the bytes as a thread attachment — use it for generated deliverables (reports, images, exports). mode "link" references an existing file in place without copying (thread dir or a connected source/worktree); it stays live for the thread lifetime, files elsewhere are not linkable — copy them. Optional name overrides the displayed file name.',
    operations: ['fs.read'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative to the run root or absolute' },
        name: { type: 'string', description: 'Optional display name override' },
        mode: { type: 'string', enum: ['copy', 'link'] },
      },
      required: ['path'],
    },
    gate: fileAccessGate('read', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as { path: string; name?: string; mode?: 'copy' | 'link' };
      const mode = parsed.mode ?? 'copy';
      const absolute = resolveFileTarget(ctx, parsed.path, 'read', options);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      const scope = ports.resolveScope();
      if (mode === 'link') {
        const record = await ports.links.link(scope, { path: absolute });
        return {
          ok: true,
          path: absolute,
          name: parsed.name ?? record.name,
          mediaType: record.mediaType,
          kind: record.kind,
          sizeBytes: record.sizeBytes,
          link: linkOf(record),
        };
      }
      const { bytes, mediaType } = readFileBytes(absolute);
      const record = await ports.attachments.put(scope, {
        name: parsed.name ?? path.basename(absolute),
        bytes,
        ...(mediaType !== undefined ? { mediaType } : {}),
      });
      return attachmentToolResultOf(record, {
        threadDir: ctx.paths.threadDir,
        runRoot: ctx.cwd,
      });
    },
  });
}
