import { Editor } from '@monaco-editor/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeIcon,
  SearchIcon,
  TableIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { MonacoBoundary } from '@/shared/ui/monaco-boundary';
import { Spinner } from '@/shared/ui/spinner';
import { useTheme } from '@/shared/ui/theme-provider';
import { PreviewHint } from '@/widgets/ide-content/ui/preview-hint';
import { type CsvSort, parseCsv, sortCsvRows } from '../model/csv-parse';
import { editorThemeName } from '../model/editor-setup';
import { CsvTable } from './csv-table';
import { defineAppThemes } from './monaco-themes';

const PAGE_SIZE = 100;

export function CsvViewer({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<'table' | 'raw'>('table');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CsvSort | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setText(null);
    setFailed(false);
    setMode('table');
    setQuery('');
    setSort(null);
    setPage(0);
    void fetch(url)
      .then((response) => response.text())
      .then((value) => setText(value))
      .catch(() => setFailed(true));
  }, [url]);
  if (failed) {
    return <PreviewHint text="Could not load file." />;
  }
  if (text === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  const table = parseCsv(text);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? table.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(needle)))
    : table.rows;
  const sorted = sort ? sortCsvRows(filtered, sort, table.columnKinds) : filtered;
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const toggleSort = (column: number) => {
    setSort((current) => {
      if (!current || current.column !== column) {
        return { column, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return null;
    });
    setPage(0);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
          {table.rows.length.toLocaleString('en-US')} rows × {table.header.length} cols
        </span>
        {table.truncated ? (
          <span className="whitespace-nowrap rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600 text-xs dark:text-amber-400">
            Truncated to first {table.rows.length.toLocaleString('en-US')} rows
          </span>
        ) : null}
        <div className="relative ml-auto">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 w-52 pl-7 text-xs"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search rows..."
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery('')}
              type="button"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center rounded-md border">
          <Button
            aria-label="Table view"
            className="h-7 w-7 rounded-r-none border-0"
            onClick={() => setMode('table')}
            size="icon"
            variant={mode === 'table' ? 'secondary' : 'ghost'}
          >
            <TableIcon className="size-3.5" />
          </Button>
          <Button
            aria-label="Raw view"
            className="h-7 w-7 rounded-l-none border-0 border-l"
            onClick={() => setMode('raw')}
            size="icon"
            variant={mode === 'raw' ? 'secondary' : 'ghost'}
          >
            <CodeIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      {table.rows.length === 0 ? <PreviewHint text="This file has no data rows." /> : null}
      {table.rows.length > 0 && mode === 'raw' ? <RawCsvView text={text} /> : null}
      {table.rows.length > 0 && mode === 'table' ? (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <CsvTable
              columnKinds={table.columnKinds}
              header={table.header}
              onSortToggle={toggleSort}
              rows={pageRows}
              sort={sort}
            />
          </div>
          <div className="flex items-center gap-2 border-t px-3 py-1.5 text-muted-foreground text-xs">
            <span className="tabular-nums">
              Rows {(safePage * PAGE_SIZE + 1).toLocaleString('en-US')}–
              {Math.min((safePage + 1) * PAGE_SIZE, sorted.length).toLocaleString('en-US')} of{' '}
              {sorted.length.toLocaleString('en-US')}
              {needle ? ` (filtered from ${table.rows.length.toLocaleString('en-US')})` : ''}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                aria-label="Previous page"
                className="size-6"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                size="icon"
                variant="ghost"
              >
                <ChevronLeftIcon className="size-3.5" />
              </Button>
              <span className="tabular-nums">
                Page {safePage + 1} of {pageCount}
              </span>
              <Button
                aria-label="Next page"
                className="size-6"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                size="icon"
                variant="ghost"
              >
                <ChevronRightIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RawCsvView({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <MonacoBoundary
      fallback={
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Spinner className="size-5" />
        </div>
      }
    >
      <Editor
        height="100%"
        value={text}
        language="plaintext"
        theme={editorThemeName(theme)}
        options={{ readOnly: true, minimap: { enabled: false } }}
        loading={<Spinner className="size-5 text-muted-foreground" />}
        beforeMount={defineAppThemes}
      />
    </MonacoBoundary>
  );
}
