import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { GoogleToolsDeps } from './google-tools-deps.ts';

interface DocumentIdInput {
  documentId: string;
}

interface AppendTextInput {
  documentId: string;
  text: string;
}

export function createDocsTools(deps: GoogleToolsDeps): ToolDefinition[] {
  return [
    tool('docs_read_document', {
      group: 'google',
      description:
        'Read a Google Docs document as plain text: paragraphs in order, table cell text joined with tabs. Use for scripts, briefs, and descriptions stored in Docs.',
      input: {
        type: 'object',
        properties: { documentId: { type: 'string' } },
        required: ['documentId'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as DocumentIdInput;
          const document = await deps.google.readDocument(
            deps.resolveScope(),
            deps.integrationId,
            input.documentId,
          );
          return { document };
        }),
    }),
    tool('docs_append_text', {
      group: 'google',
      description:
        'Append text at the end of a Google Docs document as a new paragraph block. Use for adding script drafts, notes, or descriptions.',
      input: {
        type: 'object',
        properties: {
          documentId: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['documentId', 'text'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as AppendTextInput;
          await deps.google.appendText(deps.resolveScope(), deps.integrationId, {
            documentId: input.documentId,
            text: input.text,
          });
          return { documentId: input.documentId, appended: true };
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
