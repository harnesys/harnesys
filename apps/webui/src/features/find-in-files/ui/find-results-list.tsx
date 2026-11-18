import { useEffect, useRef } from 'react';
import type { ContentSearchFile, ContentSearchMatch } from '@/shared/api/content-search';
import { cn } from '@/shared/lib/utils';
import { FileTypeIcon } from '@/shared/ui/icons';
import type { FindHit } from '../model/find-in-files-search';
import { FindMatchText } from './find-match-text';

interface FindResultsListProps {
  files: ContentSearchFile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen: (hit: FindHit) => void;
}

export function FindResultsList({ files, selectedIndex, onSelect, onOpen }: FindResultsListProps) {
  let index = -1;
  return (
    <div
      className="min-h-0 flex-1 overflow-auto rounded-lg border"
      data-testid="find-in-files-results"
    >
      {files.map((file) => (
        <div key={`${file.sourceId}:${file.path}`}>
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/70 px-2 py-1 backdrop-blur">
            <FileTypeIcon name={file.name} />
            <span className="font-medium text-xs">{file.name}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
              {file.path}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {file.matches.length}
            </span>
          </div>
          {file.matches.map((match) => {
            index += 1;
            const hitIndex = index;
            return (
              <FindMatchRow
                key={`${file.path}:${match.line}:${match.column}`}
                match={match}
                selected={hitIndex === selectedIndex}
                onSelect={() => {
                  onSelect(hitIndex);
                }}
                onOpen={() => {
                  onOpen({
                    sourceId: file.sourceId,
                    path: file.path,
                    name: file.name,
                    match,
                  });
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface FindMatchRowProps {
  match: ContentSearchMatch;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

function FindMatchRow({ match, selected, onSelect, onOpen }: FindMatchRowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      title="Double-click to open"
      data-testid="find-in-files-hit"
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-2 px-2 py-0.5 text-left font-mono text-xs outline-none',
        selected ? 'bg-live/10' : 'hover:bg-muted/60',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
        {match.line}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-all">
        <FindMatchText text={match.text} ranges={[match]} />
      </span>
    </button>
  );
}
