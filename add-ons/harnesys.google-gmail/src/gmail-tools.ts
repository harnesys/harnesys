import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { decodeBase64Url, encodeBase64Url, GMAIL_API, gmailJson } from './gmail-client.ts';
import {
  type GmailAttachmentRef,
  type GmailMessageMeta,
  type GmailMessageSummary,
  type GmailMessageWire,
  type GmailThreadWire,
  messageMetaOf,
  messageSummaryOf,
  threadMessagesOf,
} from './gmail-message.ts';

const SEARCH_MAX = 25;
const DEFAULT_SEARCH_MAX = 10;
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const WRITE_CHUNK_BYTES = 4 * 1024 * 1024;
const METADATA_HEADERS = ['Subject', 'From', 'Date'];

interface MessageListWire {
  messages?: Array<{ id?: string; threadId?: string }>;
}

interface AttachmentWire {
  data?: string;
  size?: number;
}

const searchMessages: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const query = requiredTextOf(input, 'query');
  const maxResults = Math.min(maxResultsOf(input, DEFAULT_SEARCH_MAX), SEARCH_MAX);
  const account = accountOf(input);
  const list = await gmailJson<MessageListWire>(ctx, {
    ...account,
    url: `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
  });
  const ids = (list.messages ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
  const metas = await Promise.all(
    ids.map(async (id) => {
      const wire = await gmailJson<GmailMessageWire>(ctx, {
        ...account,
        url: `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=${METADATA_HEADERS.join('&metadataHeaders=')}`,
      });
      return messageMetaOf(wire);
    }),
  );
  return { messages: metas } satisfies { messages: GmailMessageMeta[] };
};

const readMessage: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const messageId = requiredTextOf(input, 'messageId');
  const wire = await gmailJson<GmailMessageWire>(ctx, {
    ...accountOf(input),
    url: `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=full`,
  });
  return { message: messageSummaryOf(wire) } satisfies { message: GmailMessageSummary };
};

const readThread: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const threadId = requiredTextOf(input, 'threadId');
  const wire = await gmailJson<GmailThreadWire>(ctx, {
    ...accountOf(input),
    url: `${GMAIL_API}/threads/${encodeURIComponent(threadId)}?format=full`,
  });
  return { threadId, messages: threadMessagesOf(wire) } satisfies {
    threadId: string;
    messages: GmailMessageSummary[];
  };
};

const sendMessage: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const to = requiredTextOf(input, 'to');
  const subject = requiredTextOf(input, 'subject');
  const body = requiredTextOf(input, 'body');
  const cc = optionalTextOf(input, 'cc');
  const account = accountOf(input);
  const raw = encodeBase64Url(new TextEncoder().encode(rfc822Of({ to, subject, body, cc })));
  const sent = await gmailJson<GmailMessageWire>(ctx, {
    ...account,
    method: 'POST',
    url: `${GMAIL_API}/messages/send`,
    body: JSON.stringify({ raw }),
  });
  const meta = messageMetaOf(sent);
  await ctx.log.info('gmail message sent', { messageId: meta.id, threadId: meta.threadId });
  return { id: meta.id, threadId: meta.threadId } satisfies { id: string; threadId: string };
};

const saveAttachment: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const messageId = requiredTextOf(input, 'messageId');
  const attachmentId = requiredTextOf(input, 'attachmentId');
  const path = requiredTextOf(input, 'path');
  const account = accountOf(input);
  const wire = await gmailJson<GmailMessageWire>(ctx, {
    ...account,
    url: `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=full`,
  });
  const attachment = attachmentOf(wire, attachmentId);
  const payload = await gmailJson<AttachmentWire>(ctx, {
    ...account,
    url: `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  });
  if (typeof payload.data !== 'string') {
    throw new AddonError('invalid_response', { detail: 'Gmail attachment has no data' });
  }
  const bytes = decodeBase64Url(payload.data);
  if (bytes.byteLength === 0) {
    throw new AddonError('invalid_response', { detail: 'Gmail attachment is empty' });
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `attachment is ${bytes.byteLength} bytes; only attachments up to ${MAX_ATTACHMENT_BYTES} bytes are supported`,
    });
  }
  let offset = 0;
  while (offset < bytes.byteLength) {
    const chunk = bytes.subarray(offset, Math.min(offset + WRITE_CHUNK_BYTES, bytes.byteLength));
    await ctx.files.write({
      path,
      data: Buffer.from(chunk).toString('base64'),
      ...(offset === 0 ? {} : { append: true }),
    });
    offset += chunk.byteLength;
  }
  await ctx.log.info('gmail attachment saved', {
    messageId,
    attachmentId,
    path,
    size: bytes.byteLength,
  });
  return {
    path,
    name: attachment.filename,
    mediaType: attachment.mimeType,
    size: bytes.byteLength,
  } satisfies { path: string; name: string; mediaType: string; size: number };
};

export const gmailTools: Record<string, ToolHandler> = {
  search_messages: searchMessages,
  read_message: readMessage,
  read_thread: readThread,
  send_message: sendMessage,
  save_attachment: saveAttachment,
};

function rfc822Of(message: {
  to: string;
  subject: string;
  body: string;
  cc: string | undefined;
}): string {
  const headers = [
    `To: ${message.to}`,
    ...(message.cc === undefined ? [] : [`Cc: ${message.cc}`]),
    `Subject: ${message.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${message.body.replace(/\r?\n/g, '\r\n')}\r\n`;
}

function attachmentOf(wire: GmailMessageWire, attachmentId: string): GmailAttachmentRef {
  const found = messageSummaryOf(wire).attachments.find(
    (entry) => entry.attachmentId === attachmentId,
  );
  if (found === undefined) {
    throw new AddonError('not_found', {
      detail: `attachment ${attachmentId} is not part of message ${wire.id ?? ''}`,
    });
  }
  return found;
}

function accountOf(input: Record<string, unknown>): { accountId?: string } {
  const accountId = optionalTextOf(input, 'accountId');
  return accountId === undefined ? {} : { accountId };
}

function maxResultsOf(input: Record<string, unknown>, fallback: number): number {
  const raw = input.maxResults;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return fallback;
  }
  return Math.min(Math.max(1, raw), SEARCH_MAX);
}

function requiredTextOf(input: Record<string, unknown>, key: string): string {
  const value = optionalTextOf(input, key);
  if (value === undefined) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalTextOf(input: Record<string, unknown>, key: string): string | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new AddonError('invalid_params', { detail: `${key} must be a string` });
  }
  return raw === '' ? undefined : raw;
}
