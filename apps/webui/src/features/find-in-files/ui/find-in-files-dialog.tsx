import { AlertTriangleIcon, LoaderCircleIcon, SearchIcon, SearchXIcon } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useProjects } from '@/entities/project';
import type { ContentSearchFile, ContentSearchResponse } from '@/shared/api/content-search';
import { useOrgId } from '@/shared/config/location';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { DialogTitle } from '@/shared/ui/dialog';
import { Resizer } from '@/shared/ui/resizer';
import { Spinner } from '@/shared/ui/spinner';
import type { FindInFilesMode, FindInFilesOptions } from '../index';
import {
  ALL_SOURCES,
  type FindHit,
  flattenHits,
  hitTarget,
  useFindInFilesSearch,
  visibleFiles,
  visibleTargets,
} from '../model/find-in-files-search';
import { useOpenFindHit } from '../model/open-find-hit';
import { useDebouncedValue } from '../model/use-debounced-value';
import { usePreviewHeight } from '../model/use-preview-height';
import { useReplaceFlow } from '../model/use-replace-flow';
import { useReplacedHits } from '../model/use-replaced-hits';
import { FindPlaceholder } from './find-placeholder';
import { FindPreviewPane } from './find-preview-pane';
import { FindReplaceConfirm } from './find-replace-confirm';
import { FindReplaceField } from './find-replace-field';
import { FindResultsList } from './find-results-list';
import { FindScopeRow } from './find-scope-row';
import { FindSearchField } from './find-search-field';

const DEBOUNCE_MS = 250;
type SearchSummary = Pick<ContentSearchResponse, 'matchCount' | 'fileCount' | 'truncated'>;

export function FindInFilesDialog({
  onResolve,
  data,
}: DialogComponentProps<void, FindInFilesOptions>) {
  const orgId = useOrgId() ?? '';
  const mode: FindInFilesMode = data?.mode ?? 'find';
  const { data: projects } = useProjects();
  const [q, setQ] = useState(data?.initialQuery ?? '');
  const [replacement, setReplacement] = useState('');
  const [mask, setMask] = useState('');
  const [sourceId, setSourceId] = useState<string>(data?.sourceId ?? ALL_SOURCES);
  const [dir, setDir] = useState(data?.dir ?? '');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const debouncedQ = useDebouncedValue(q.trim(), DEBOUNCE_MS);
  const debouncedMask = useDebouncedValue(mask.trim(), DEBOUNCE_MS);
  const searchInput = {
    orgId,
    q: debouncedQ,
    sourceId,
    dir,
    caseSensitive,
    wholeWord,
    regex,
    mask: debouncedMask,
  };
  const search = useFindInFilesSearch(searchInput);
  const flow = useReplaceFlow(orgId, {
    q: debouncedQ,
    replacement,
    ...(sourceId === ALL_SOURCES ? {} : { sourceId }),
    ...(dir.length > 0 ? { dir } : {}),
    caseSensitive,
    wholeWord,
    regex,
    ...(debouncedMask.length > 0 ? { mask: debouncedMask } : {}),
  });
  const queryKey = [debouncedQ, debouncedMask, sourceId, dir, caseSensitive, wholeWord, regex].join(
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
  const replacedHits = useReplacedHits(queryKey);
  const openHit = useOpenFindHit();
  const preview = usePreviewHeight();
  const files = visibleFiles(search.data?.files ?? [], replacedHits.replacedKeys);
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

  const handleReplaceOne = async () => {
    if (activeHit === undefined || debouncedQ.length === 0) {
      return;
    }
    const target = hitTarget(activeHit);
    if (await flow.replaceOne(target)) {
      replacedHits.drop([target]);
    }
  };

  const handleReplaceAll = async () => {
    if (debouncedQ.length === 0) {
      return;
    }
    if (flow.confirmation === null) {
      await flow.requestPreview(visibleTargets(hits, search.data?.truncated === true));
      return;
    }
    const applied = await flow.apply();
    if (applied !== null) {
      replacedHits.drop(applied);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="find-in-files-dialog">
      <DialogTitle className="flex items-baseline gap-2 text-sm">
        {mode === 'replace' ? 'Replace in Files' : 'Find in Files'}
        <span className="font-normal text-muted-foreground text-xs">
          {summaryText({
            matchCount: hits.length,
            fileCount: files.length,
            truncated: search.data?.truncated ?? false,
          })}
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
      {mode === 'replace' ? (
        <FindReplaceField
          value={replacement}
          onValue={setReplacement}
          onReplace={handleReplaceOne}
          onReplaceAll={handleReplaceAll}
          replaceDisabled={activeHit === undefined}
          replaceAllDisabled={debouncedQ.length === 0 || (search.data?.matchCount ?? 0) === 0}
          pending={flow.pendingKind}
        />
      ) : null}
      {flow.confirmation === null ? null : (
        <FindReplaceConfirm
          matches={flow.confirmation.matches}
          files={flow.confirmation.files}
          applying={flow.pending}
          onApply={flow.apply}
          onCancel={flow.dismiss}
        />
      )}
      <FindScopeRow
        projects={projects ?? []}
        sourceId={sourceId}
        onSourceId={(next) => {
          setSourceId(next);
          setDir('');
        }}
        dir={dir}
        onClearDir={() => {
          setDir('');
        }}
        mask={mask}
        onMask={setMask}
        errors={errors}
      />
      <div ref={preview.containerRef} className="flex min-h-0 flex-1 flex-col gap-1.5">
        <ResultsArea
          q={debouncedQ}
          pending={search.isPending}
          files={files}
          matchCount={hits.length}
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
  files,
  matchCount,
  error,
  selectedIndex,
  onSelect,
  onOpen,
}: {
  q: string;
  pending: boolean;
  files: ContentSearchFile[];
  matchCount: number;
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
  if (pending && matchCount === 0) {
    return (
      <FindPlaceholder icon={<LoaderCircleIcon className="animate-spin" />} text="Searching…" />
    );
  }
  if (matchCount === 0) {
    return <FindPlaceholder icon={<SearchXIcon />} text="No matches found." />;
  }
  return (
    <FindResultsList
      files={files}
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      onOpen={onOpen}
    />
  );
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

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
