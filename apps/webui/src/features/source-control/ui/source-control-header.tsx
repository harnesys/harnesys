import type { GitBranch } from '@harnesys/studio-shared';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  GitBranchIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

interface SourceControlHeaderProps {
  branch: string | null;
  detached: boolean;
  branches: GitBranch[];
  ahead: number;
  behind: number;
  hasRemote: boolean;
  isFetching: boolean;
  onCheckout: (branch: string) => void;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
}

export function SourceControlHeader({
  branch,
  detached,
  branches,
  ahead,
  behind,
  hasRemote,
  isFetching,
  onCheckout,
  onFetch,
  onPull,
  onPush,
}: SourceControlHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-w-[220px] justify-start gap-1.5"
              disabled={branches.length === 0}
              title="Switch branch"
            />
          }
        >
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="truncate font-mono text-xs">
            {branch ?? (detached ? 'HEAD' : 'No branch')}
          </span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 min-w-52 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Local branches</DropdownMenuLabel>
            {branches.map((item) => (
              <DropdownMenuItem
                key={item.name}
                disabled={item.current}
                onClick={() => onCheckout(item.name)}
              >
                <GitBranchIcon />
                <span className="truncate font-mono text-xs">{item.name}</span>
                {item.current ? (
                  <span className="ml-auto text-[10px] text-muted-foreground uppercase">
                    Current
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onFetch}
          disabled={!hasRemote || isFetching}
          title="Fetch"
          aria-label="Fetch"
        >
          <RefreshCwIcon className={isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPull}
          disabled={!hasRemote}
          title="Pull"
          aria-label="Pull"
          className="relative"
        >
          <ArrowDownIcon className="size-3.5" />
          {behind > 0 ? <SyncBadge value={behind} /> : null}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPush}
          disabled={!hasRemote}
          title="Push"
          aria-label="Push"
          className="relative"
        >
          <ArrowUpIcon className="size-3.5" />
          {ahead > 0 ? <SyncBadge value={ahead} /> : null}
        </Button>
      </div>
    </div>
  );
}

function SyncBadge({ value }: { value: number }) {
  return (
    <span className="absolute -top-0.5 -right-0.5 flex min-w-3 items-center justify-center rounded-full bg-muted px-0.5 font-mono text-[9px] text-muted-foreground leading-tight">
      {value > 99 ? '99+' : value}
    </span>
  );
}
