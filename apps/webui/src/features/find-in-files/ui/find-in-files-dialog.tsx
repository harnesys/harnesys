import { AlertTriangleIcon, LoaderCircleIcon, SearchIcon, SearchXIcon } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useProjects } from '@/entities/project';
import type { ContentSearchError, ContentSearchResponse } from '@/shared/api/content-search';
import { useOrgId } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { DialogTitle } from '@/shared/ui/dialog';
import { Resizer } from '@/shared/ui/resizer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import {
  ALL_SOURCES,
  type FindHit,
  flattenHits,
  useFindInFilesSearch,
} from '../model/find-in-files-search';
import { useOpenFindHit } from '../model/open-find-hit';
import { useDebouncedValue } from '../model/use-debounced-value';
import { usePreviewHeight } from '../model/use-preview-height';
import { FindMaskField } from './find-mask-field';
import { FindPlaceholder } from './find-placeholder';
import { FindPreviewPane } from './find-preview-pane';
import { FindResultsList } from './find-results-list';
import { FindSearchField } from './find-search-field';

const DEBOUNCE_MS = 250;
type SearchSummary = Pick<ContentSearchResponse, 'matchCount' | 'fileCount' | 'truncated'>;

export function FindInFilesDialog({ onResolve }: DialogComponentProps<void>) {
  const orgId = useOrgId() ?? '';
  const { data: projects } = useProjects();
  const [q, setQ] = useState('');
  const [mask, setMask] = useState('');
  const [sourceId, setSourceId] = useState<string>(ALL_SOURCES);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const debouncedQ = useDebouncedValue(q.trim(), DEBOUNCE_MS);
  const debouncedMask = useDebouncedValue(mask.trim(), DEBOUNCE_MS);
  const search = useFindInFilesSearch({
    orgId,
    q: debouncedQ,
    sourceId,
    caseSensitive,
    wholeWord,
    regex,
    mask: debouncedMask,
  });
  const queryKey = [debouncedQ, debouncedMask, sourceId, caseSensitive, wholeWord, regex].join(
    '\n',
  );
  const [selection, setSelection] = useState<{ key: string; index: number }>({
    key: queryKey,
    index: 0,
  });
  const selected = selection.key === queryKey ? selection.index : 0;
  const setSelected = (index: number) => {
    setSelection({ key: queryKey, index });
  };
  const openHit = useOpenFindHit();
  const preview = usePreviewHeight();
  const files = search.data?.files ?? [];
  const hits = flattenHits(files);
  const activeIndex = hits.length === 0 ? -1 : Math.min(selected, hits.length - 1);
  const activeHit = activeIndex >= 0 ? hits[activeIndex] : undefined;
  const activeFile =
    activeHit === undefined
      ? null
      : (files.find(
          (file) => file.sourceId === activeHit.sourceId && file.path === activeHit.path,
        ) ?? null);
  const errors = search.data?.errors ?? [];

  const handleOpen = (hit: FindHit) => {
    openHit(hit);
    onResolve?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (hits.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected(Math.min(activeIndex + 1, hits.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(Math.max(activeIndex - 1, 0));
      return;
    }
    if (event.key === 'Enter' && activeHit !== undefined) {
      event.preventDefault();
      handleOpen(activeHit);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="find-in-files-dialog">
      <DialogTitle className="flex items-baseline gap-2 text-sm">
        Find in Files
        <span className="font-normal text-muted-foreground text-xs">
          {summaryText(search.data)}
        </span>
        {search.isFetching ? <Spinner className="size-3" /> : null}
      </DialogTitle>
      <FindSearchField
        q={q}
        onQ={setQ}
        caseSensitive={caseSensitive}
        onCaseSensitive={setCaseSensitive}
        wholeWord={wholeWord}
        onWholeWord={setWholeWord}
        regex={regex}
        onRegex={setRegex}
        onFieldKeyDown={handleKeyDown}
      />
      <div className="flex items-center gap-2">
        <Select
          items={[{ value: ALL_SOURCES, label: 'All sources' }, ...sourceItems(projects ?? [])]}
          value={sourceId}
          onValueChange={(next) => {
            if (typeof next === 'string') {
              setSourceId(next);
            }
          }}
        >
          <SelectTrigger
            className="h-7 w-56"
            aria-label="Search scope"
            data-testid="find-in-files-scope"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SOURCES}>All sources</SelectItem>
            {(projects ?? []).map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className={cn('text-status-warn text-xs', errors.length === 0 && 'hidden')}>
          {unavailableText(errors)}
        </span>
        <div className="ml-auto">
          <FindMaskField mask={mask} onMask={setMask} />
        </div>
      </div>
      <div ref={preview.containerRef} className="flex min-h-0 flex-1 flex-col gap-1.5">
        <ResultsArea
          q={debouncedQ}
          pending={search.isPending}
          data={search.data}
          error={search.error instanceof Error ? search.error : null}
          selectedIndex={activeIndex}
          onSelect={setSelected}
          onOpen={handleOpen}
        />
        <Resizer
          label="Resize preview"
          testId="find-in-files-preview-resize"
          orientation="vertical"
          dragging={preview.dragging}
          onResizeStart={preview.onResizeStart}
        />
        <div className="min-h-0 shrink-0" style={{ height: preview.height }}>
          <FindPreviewPane orgId={orgId} file={activeFile} match={activeHit?.match ?? null} />
        </div>
      </div>
    </div>
  );
}

function ResultsArea({
  q,
  pending,
  data,
  error,
  selectedIndex,
  onSelect,
  onOpen,
}: {
  q: string;
  pending: boolean;
  data: ContentSearchResponse | undefined;
  error: Error | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen: (hit: FindHit) => void;
}) {
  if (q.length === 0) {
    return (
      <FindPlaceholder icon={<SearchIcon />} text="Type to search text across your sources." />
    );
  }
  if (error) {
    return <FindPlaceholder icon={<AlertTriangleIcon />} text={error.message} />;
  }
  if (pending && data === undefined) {
    return (
      <FindPlaceholder icon={<LoaderCircleIcon className="animate-spin" />} text="Searching…" />
    );
  }
  if (!data || data.matchCount === 0) {
    return <FindPlaceholder icon={<SearchXIcon />} text="No matches found." />;
  }
  return (
    <FindResultsList
      files={data.files}
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      onOpen={onOpen}
    />
  );
}

function sourceItems(projects: Array<{ id: string; name: string }>) {
  return projects.map((project) => ({ value: project.id, label: project.name }));
}

function summaryText(data: SearchSummary | undefined): string {
  if (!data) {
    return '';
  }
  if (data.matchCount === 0) {
    return 'No matches';
  }
  const suffix = data.truncated ? '+' : '';
  return `${data.matchCount}${suffix} ${plural(data.matchCount, 'match', 'matches')} in ${data.fileCount} ${plural(data.fileCount, 'file', 'files')}`;
}

function unavailableText(errors: ContentSearchError[]): string {
  if (errors.length === 0) {
    return '';
  }
  return `${errors.map((error) => error.sourceName).join(', ')} unavailable`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
