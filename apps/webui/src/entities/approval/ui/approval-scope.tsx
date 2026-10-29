import { CheckIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { type FileScopeOption, isDirAskTool } from '../model/approval-scope';

export function RememberPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="font-medium text-[11px] text-muted-foreground">Remember</p>
      {children}
    </div>
  );
}

export function FileScopeCrumbs({
  path,
  toolName,
  selectedPattern,
  onSelect,
  disabled,
}: {
  path: string;
  toolName: string | undefined;
  selectedPattern: string;
  onSelect: (option: FileScopeOption) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const dirAsk = isDirAskTool(toolName);
  const dirs = dirAsk ? segments : segments.slice(0, -1);
  const dirCrumb = (index: number): { key: string; element: ReactNode } => {
    const prefix = dirs.slice(0, index + 1).join('/');
    const pattern = `/${prefix}/**`;
    return {
      key: `dir-${index}-${prefix}`,
      element: (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title={pattern}
            disabled={disabled}
            onClick={() => {
              onSelect({ level: 'dir', label: 'Everything in folder', pattern });
            }}
            className={cn(
              'shrink-0 rounded px-1 font-mono text-[11px] transition-colors hover:bg-muted hover:text-foreground',
              selectedPattern === pattern ? 'bg-muted text-foreground' : 'text-muted-foreground',
            )}
          >
            {dirs[index]}
          </button>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">/</span>
        </span>
      ),
    };
  };
  const fileCrumb = (
    <button
      type="button"
      title={dirAsk ? `${path}/**` : `This exact file: ${path}`}
      disabled={disabled}
      onClick={() => {
        if (dirAsk) {
          onSelect({ level: 'dir', label: 'Everything in folder', pattern: `${path}/**` });
          return;
        }
        onSelect({ level: 'exact', label: 'This exact file', pattern: path });
      }}
      className={cn(
        'shrink-0 rounded px-1 font-mono text-[11px] transition-colors hover:bg-muted',
        (dirAsk ? selectedPattern === `${path}/**` : selectedPattern === path)
          ? 'bg-muted text-foreground'
          : 'text-foreground',
      )}
    >
      {segments.at(-1) ?? path}
    </button>
  );
  const visible = collapsedDirIndices(dirs.length, expanded);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap">
        <span className="shrink-0 px-0.5 font-mono text-[11px] text-muted-foreground">/</span>
        {visible.map((index, position) => {
          const key = `crumb-${position}`;
          if (index === null) {
            return (
              <button
                key={key}
                type="button"
                title="Show all levels"
                onClick={() => {
                  setExpanded(true);
                }}
                className="shrink-0 rounded px-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                …
              </button>
            );
          }
          return <span key={key}>{dirCrumb(index).element}</span>;
        })}
        {fileCrumb}
      </div>
      <p className="truncate font-mono text-[11px] text-muted-foreground" title={selectedPattern}>
        {selectedPattern}
      </p>
    </div>
  );
}

function collapsedDirIndices(count: number, expanded: boolean): (number | null)[] {
  if (expanded || count <= 3) {
    return Array.from({ length: count }, (_, index) => index);
  }
  return [0, 1, null, count - 1];
}

export function FileBlockCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className={cn(
        'flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/60',
        disabled ? 'cursor-not-allowed opacity-50' : undefined,
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked ? <CheckIcon className="size-3" /> : null}
      </span>
      <span className="text-[11px] text-muted-foreground">
        Also block this path for future runs
      </span>
    </button>
  );
}
