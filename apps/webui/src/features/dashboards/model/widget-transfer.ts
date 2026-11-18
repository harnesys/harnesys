import type { WidgetDoc } from '@harnesys/contracts';
import { WidgetDocSchema } from '@harnesys/contracts';

function fileNameOf(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'widget'}.json`;
}

export function downloadWidgetDoc(doc: WidgetDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileNameOf(doc.title);
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface WidgetImportResult {
  doc?: WidgetDoc;
  error?: string;
}

/** Parse and validate an imported doc; nothing is applied when the schema rejects it. */
export async function readWidgetDocFile(file: File): Promise<WidgetImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
  const result = WidgetDocSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      error: issue
        ? `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`
        : 'Invalid widget document',
    };
  }
  return { doc: result.data };
}
