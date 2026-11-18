import { FolderIcon, XIcon } from 'lucide-react';
import type { ContentSearchError } from '@/shared/api/content-search';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ALL_SOURCES } from '../model/find-in-files-search';
import { FindMaskField } from './find-mask-field';

interface FindScopeRowProps {
  projects: Array<{ id: string; name: string }>;
  sourceId: string;
  onSourceId: (sourceId: string) => void;
  dir: string;
  onClearDir: () => void;
  mask: string;
  onMask: (mask: string) => void;
  errors: ContentSearchError[];
}

export function FindScopeRow({
  projects,
  sourceId,
  onSourceId,
  dir,
  onClearDir,
  mask,
  onMask,
  errors,
}: FindScopeRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Select
        items={[{ value: ALL_SOURCES, label: 'All sources' }, ...sourceItems(projects)]}
        value={sourceId}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onSourceId(next);
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
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dir.length === 0 ? null : (
        <span
          className="flex max-w-64 items-center gap-1 rounded-md border px-1 py-0.5 font-mono text-[11px] text-muted-foreground"
          data-testid="find-in-files-dir"
          title={dir}
        >
          <FolderIcon className="size-3 shrink-0" />
          <span className="truncate">{dir}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear folder scope"
            data-testid="find-in-files-dir-clear"
            onClick={onClearDir}
          >
            <XIcon />
          </Button>
        </span>
      )}
      <span className={cn('text-status-warn text-xs', errors.length === 0 && 'hidden')}>
        {errorsText(errors)}
      </span>
      <div className="ml-auto">
        <FindMaskField mask={mask} onMask={onMask} />
      </div>
    </div>
  );
}

function sourceItems(projects: Array<{ id: string; name: string }>) {
  return projects.map((project) => ({ value: project.id, label: project.name }));
}

function errorsText(errors: ContentSearchError[]): string {
  if (errors.length === 0) {
    return '';
  }
  return `${errors.map((error) => error.sourceName).join(', ')} unavailable`;
}
