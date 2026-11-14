import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { docsJson, documentUrl } from './docs-client.ts';
import { type DocsDocumentWire, documentEndIndex, documentTextOf } from './docs-document.ts';

const readDocument: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const documentId = requiredTextOf(input, 'documentId');
  const document = await docsJson<DocsDocumentWire>(ctx, {
    ...accountOf(input),
    url: documentUrl(documentId),
  });
  return {
    documentId,
    title: document.title ?? '',
    revisionId: document.revisionId ?? '',
    text: documentTextOf(document.body?.content),
  } satisfies { documentId: string; title: string; revisionId: string; text: string };
};

const appendText: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const documentId = requiredTextOf(input, 'documentId');
  const text = requiredTextOf(input, 'text');
  const account = accountOf(input);
  const document = await docsJson<DocsDocumentWire>(ctx, {
    ...account,
    url: documentUrl(documentId, '?fields=documentId,body.content'),
  });
  const index = Math.max(1, documentEndIndex(document.body?.content) - 1);
  await docsJson<Record<string, unknown>>(ctx, {
    ...account,
    method: 'POST',
    url: documentUrl(documentId, ':batchUpdate'),
    body: JSON.stringify({
      requests: [{ insertText: { location: { index }, text: `\n${text}` } }],
    }),
  });
  await ctx.log.info('docs text appended', { documentId, index, length: text.length });
  return { documentId, appended: true } satisfies { documentId: string; appended: boolean };
};

export const docsTools: Record<string, ToolHandler> = {
  read_document: readDocument,
  append_text: appendText,
};

function accountOf(input: Record<string, unknown>): { accountId?: string } {
  const accountId = optionalTextOf(input, 'accountId');
  return accountId === undefined ? {} : { accountId };
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
