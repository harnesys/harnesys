const MAX_DEPTH = 8;

export interface DocsTextRunWire {
  content?: string;
}

export interface DocsParagraphWire {
  elements?: Array<{ textRun?: DocsTextRunWire }>;
}

export interface DocsTableWire {
  tableRows?: Array<{ tableCells?: Array<{ content?: DocsStructuralElementWire[] }> }>;
}

export interface DocsStructuralElementWire {
  startIndex?: number;
  endIndex?: number;
  paragraph?: DocsParagraphWire;
  table?: DocsTableWire;
  tableOfContents?: { content?: DocsStructuralElementWire[] };
}

export interface DocsDocumentWire {
  documentId?: string;
  title?: string;
  revisionId?: string;
  body?: { content?: DocsStructuralElementWire[] };
}

export function documentTextOf(
  content: DocsStructuralElementWire[] | undefined,
  depth = 0,
): string {
  if (content === undefined || depth > MAX_DEPTH) {
    return '';
  }
  return content.map((element) => elementTextOf(element, depth)).join('');
}

export function documentEndIndex(content: DocsStructuralElementWire[] | undefined): number {
  const indexes = (content ?? [])
    .map((element) => element.endIndex)
    .filter((value): value is number => typeof value === 'number');
  return indexes.length === 0 ? 1 : Math.max(...indexes);
}

function elementTextOf(element: DocsStructuralElementWire, depth: number): string {
  if (element.paragraph !== undefined) {
    return paragraphTextOf(element.paragraph);
  }
  if (element.table !== undefined) {
    return tableTextOf(element.table, depth);
  }
  if (element.tableOfContents !== undefined) {
    return documentTextOf(element.tableOfContents.content, depth + 1);
  }
  return '';
}

function paragraphTextOf(paragraph: DocsParagraphWire): string {
  return (paragraph.elements ?? []).map((element) => element.textRun?.content ?? '').join('');
}

function tableTextOf(table: DocsTableWire, depth: number): string {
  const rows = (table.tableRows ?? []).map((row) =>
    (row.tableCells ?? [])
      .map((cell) =>
        documentTextOf(cell.content, depth + 1)
          .replace(/\n/g, ' ')
          .trim(),
      )
      .join('\t'),
  );
  return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
}
