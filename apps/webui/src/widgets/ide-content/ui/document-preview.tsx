import { useQuery } from '@tanstack/react-query';
import { PreviewHint } from './preview-hint';

interface SheetView {
  name: string;
  headers: string[];
  rows: string[][];
}
type DocView = { kind: 'docx'; html: string } | { kind: 'xlsx'; sheets: SheetView[] };

async function parseDocument(name: string, buffer: ArrayBuffer): Promise<DocView> {
  if (name.toLowerCase().endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return { kind: 'docx', html: result.value };
  }
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets: SheetView[] = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });
    const [headers = [], ...body] = rows.map((row) => row.map((cell) => String(cell ?? '')));
    return { name: sheetName, headers, rows: body };
  });
  return { kind: 'xlsx', sheets };
}

export function DocumentPreview({ name, url }: { name: string; url: string }) {
  const query = useQuery({
    queryKey: ['document-preview', name, url],
    queryFn: async () => parseDocument(name, await (await fetch(url)).arrayBuffer()),
  });
  if (query.isPending) {
    return <PreviewHint text="Loading…" />;
  }
  if (query.isError || !query.data) {
    return <PreviewHint text="Could not render preview." />;
  }
  const view = query.data;
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4">
      <div className="mx-auto w-full max-w-6xl rounded-lg border bg-background p-6 shadow-sm">
        {view.kind === 'docx' ? (
          <div
            className="docx-preview [&_h1]:mb-3 [&_h1]:font-semibold [&_h1]:text-xl [&_h2]:mb-2 [&_h2]:font-semibold [&_h2]:text-lg [&_h3]:mb-2 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold"
            dangerouslySetInnerHTML={{ __html: view.html }}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {view.sheets.map((sheet) => (
              <section key={sheet.name} className="min-w-0">
                <h3 className="mb-2 font-medium text-sm">{sheet.name}</h3>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {sheet.headers.map((header, i) => (
                          <th
                            key={i}
                            className="sticky top-0 z-10 whitespace-nowrap border border-border bg-muted/80 px-2 py-1 text-left font-semibold backdrop-blur-sm"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.map((row, r) => (
                        <tr key={r} className="even:bg-muted/20">
                          {sheet.headers.map((_, c) => (
                            <td
                              key={c}
                              className="whitespace-nowrap border border-border px-2 py-1 align-top"
                            >
                              {row[c] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
