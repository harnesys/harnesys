import type { GoogleDocsAppendInput, GoogleDocsDocument } from 'harnesys';
import { asGoogleRecord, googleApiJson, stringField } from './google-http.ts';

const DOCS_API_BASE = '/docs/v1/documents';

export async function getDocument(token: string, documentId: string): Promise<GoogleDocsDocument> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${DOCS_API_BASE}/${encodeURIComponent(documentId)}`,
  });
  const body = asGoogleRecord(res.body);
  const elements = Array.isArray(body.content) ? body.content : [];
  return {
    documentId: stringField(res, 'documentId') ?? documentId,
    title: stringField(res, 'title') ?? '',
    text: flattenElements(elements),
    revisionId: stringField(res, 'revisionId'),
  };
}

export async function appendText(token: string, input: GoogleDocsAppendInput): Promise<void> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${DOCS_API_BASE}/${encodeURIComponent(input.documentId)}`,
  });
  const endIndex = lastEndIndexOf(asGoogleRecord(res.body));
  if (endIndex === null) {
    throw new Error(`document ${input.documentId} has no content to append after`);
  }
  await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${DOCS_API_BASE}/${encodeURIComponent(input.documentId)}:batchUpdate`,
    body: {
      requests: [
        {
          insertText: {
            location: { index: endIndex - 1 },
            text: `\n${input.text}`,
          },
        },
      ],
    },
  });
}

function lastEndIndexOf(body: Record<string, unknown>): number | null {
  const content = Array.isArray(body.content) ? body.content : [];
  let last: number | null = null;
  for (const element of content) {
    const endIndex = asGoogleRecord(element).endIndex;
    if (typeof endIndex === 'number') {
      last = endIndex;
    }
  }
  return last;
}

function flattenElements(elements: unknown[]): string {
  const out: string[] = [];
  for (const element of elements) {
    const record = asGoogleRecord(element);
    if (record.paragraph !== undefined) {
      out.push(paragraphTextOf(asGoogleRecord(record.paragraph)));
    } else if (record.table !== undefined) {
      out.push(tableTextOf(asGoogleRecord(record.table)));
    } else if (record.tableOfContents !== undefined) {
      const content = asGoogleRecord(record.tableOfContents).content;
      out.push(flattenElements(Array.isArray(content) ? content : []));
    }
  }
  return out.join('').trimEnd();
}

function paragraphTextOf(paragraph: Record<string, unknown>): string {
  const elements = Array.isArray(paragraph.elements) ? paragraph.elements : [];
  let text = '';
  for (const entry of elements) {
    const run = asGoogleRecord(asGoogleRecord(entry).textRun);
    text += typeof run.content === 'string' ? run.content : '';
  }
  return `${text}\n`;
}

function tableTextOf(table: Record<string, unknown>): string {
  const rows = Array.isArray(table.tableRows) ? table.tableRows : [];
  const lines: string[] = [];
  for (const row of rows) {
    const rawCells = asGoogleRecord(row).tableCells;
    const cells = Array.isArray(rawCells) ? rawCells : [];
    const cellTexts = cells.map((cell) =>
      flattenElements(asGoogleRecord(cell).content as unknown[]).replace(/\n/g, ' '),
    );
    lines.push(cellTexts.join('\t'));
  }
  return `${lines.join('\n')}\n`;
}
