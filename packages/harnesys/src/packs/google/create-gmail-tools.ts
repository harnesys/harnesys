import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import { attachmentToolResultOf } from '../../application/attachment-result.ts';
import type { FileToolResult } from '../../application/tool-message.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  GoogleGmailAttachmentSaved,
  GoogleGmailAttachmentSavedToFile,
  GoogleGmailSendInput,
  GoogleWorkspacePort,
} from '../../ports/google-workspace.ts';
import { type ToolContext, type ToolDefinition, tool } from '../../ports/tools.ts';

export interface CreateGmailToolsParams {
  google: GoogleWorkspacePort;
  resolveScope: () => CapabilityScope;
  integrationId: string;
}

interface GmailSearchInput {
  query: string;
  maxResults?: number;
}

interface GmailReadMessageInput {
  messageId: string;
}

interface GmailReadThreadInput {
  threadId: string;
}

interface GmailSendInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

interface GmailDownloadAttachmentInput {
  messageId: string;
  attachmentId: string;
  filename?: string;
  mimeType?: string;
  savePath?: string;
}

const SEARCH_RESULTS_MAX = 25;

export function createGmailTools(deps: CreateGmailToolsParams): ToolDefinition[] {
  return [
    tool('gmail_search_messages', {
      group: 'google',
      description:
        'Search Gmail messages with a Gmail search query (same syntax as the Gmail search box, e.g. "from:alice is:unread newer_than:7d"). Returns id, snippet, subject, from, date per match.',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query' },
          maxResults: { type: 'integer', minimum: 1, maximum: 25 },
        },
        required: ['query'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as GmailSearchInput;
          const maxResults = input.maxResults ?? 10;
          const messages = await deps.google.searchMessages(
            deps.resolveScope(),
            deps.integrationId,
            input.query,
            Math.min(maxResults, SEARCH_RESULTS_MAX),
          );
          return { messages };
        }),
    }),
    tool('gmail_read_message', {
      group: 'google',
      description:
        'Read a single Gmail message: headers (from/to/cc/subject/date), the text/plain body, and the attachments list (filename, mimeType, size, attachmentId). Use gmail_search_messages to find messageId.',
      input: {
        type: 'object',
        properties: { messageId: { type: 'string' } },
        required: ['messageId'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as GmailReadMessageInput;
          const message = await deps.google.readMessage(
            deps.resolveScope(),
            deps.integrationId,
            input.messageId,
          );
          return { message };
        }),
    }),
    tool('gmail_read_thread', {
      group: 'google',
      description:
        'Read a Gmail thread: all messages in order with headers, text/plain bodies, and per-message attachments lists. Use gmail_search_messages to find threadId.',
      input: {
        type: 'object',
        properties: { threadId: { type: 'string' } },
        required: ['threadId'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as GmailReadThreadInput;
          const thread = await deps.google.readThread(
            deps.resolveScope(),
            deps.integrationId,
            input.threadId,
          );
          return { thread };
        }),
    }),
    tool('gmail_download_attachment', {
      group: 'google',
      description:
        'Download a Gmail attachment (PDF, Excel, photo, any file). Get messageId and attachmentId from the attachments list in gmail_read_message or gmail_read_thread. Pass filename and mimeType from that list when known. By default the file is attached to the chat so the user can open it; pass savePath to write it into the workspace instead (e.g. furniture/leads/<id>/invoice.pdf). Files over 20 MB are rejected.',
      input: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          attachmentId: { type: 'string' },
          filename: {
            type: 'string',
            description: 'Original filename from the attachments list',
          },
          mimeType: { type: 'string', description: 'MIME type from the attachments list' },
          savePath: {
            type: 'string',
            description:
              'Write the file to this workspace path (absolute or relative to cwd) instead of attaching it to the chat. Parent directories are created.',
          },
        },
        required: ['messageId', 'attachmentId'],
      },
      sideEffect: 'write',
      gate: fileAccessGate('edit', (input) => (input as GmailDownloadAttachmentInput).savePath),
      execute: async (raw, ctx) =>
        runGuard(() => downloadGmailAttachment(deps, raw as GmailDownloadAttachmentInput, ctx)),
    }),
    tool('gmail_send_message', {
      group: 'google',
      description:
        'Send an email from the connected Google account. to/cc accept one address or several comma-separated. body is plain text.',
      input: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient address (or comma-separated addresses)' },
          subject: { type: 'string' },
          body: { type: 'string', description: 'Plain-text email body' },
          cc: { type: 'string', description: 'Cc address (or comma-separated addresses)' },
        },
        required: ['to', 'subject', 'body'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as GmailSendInput;
          const send: GoogleGmailSendInput = {
            to: input.to,
            subject: input.subject,
            body: input.body,
            ...(input.cc !== undefined ? { cc: input.cc } : {}),
          };
          return await deps.google.sendMessage(deps.resolveScope(), deps.integrationId, send);
        }),
    }),
  ];
}

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function downloadGmailAttachment(
  deps: CreateGmailToolsParams,
  input: GmailDownloadAttachmentInput,
  ctx: ToolContext,
): Promise<FileToolResult | GoogleGmailAttachmentSavedToFile> {
  const meta =
    input.filename !== undefined && input.mimeType !== undefined
      ? { filename: input.filename, mimeType: input.mimeType }
      : undefined;
  if (input.savePath === undefined) {
    const record = await deps.google.downloadAttachment(
      deps.resolveScope(),
      deps.integrationId,
      input.messageId,
      input.attachmentId,
      meta !== undefined ? { meta } : undefined,
    );
    return attachmentToolResultOf(record as GoogleGmailAttachmentSaved);
  }
  const savePath = resolveFileTarget(ctx, input.savePath, 'edit', {});
  const blocking = firstBlockingPattern(savePath, DEFAULT_PATH_BLOCKLIST);
  if (blocking) {
    throw new Error(`Path is blocked (${blocking}): ${input.savePath}`);
  }
  const saved = await deps.google.downloadAttachment(
    deps.resolveScope(),
    deps.integrationId,
    input.messageId,
    input.attachmentId,
    {
      ...(meta !== undefined ? { meta } : {}),
      savePath,
      locator: cwdLocatorOf(ctx.cwd, savePath),
    },
  );
  return saved as GoogleGmailAttachmentSavedToFile;
}

function cwdLocatorOf(cwd: string, absolute: string): string {
  return path.relative(cwd, absolute).split(path.sep).join('/');
}
