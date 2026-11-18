import {
  DEFAULT_GIT_STATUS_COLORS,
  GIT_STATUS_GROUPS,
  GIT_STATUS_STATUSES,
  type GitStatusSettingsRow,
  gitStatusColorClass,
  useGitStatusColors,
} from '@/shared/lib/git-status-colors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SettingsSection } from '@/shared/ui/settings-kit';

export function GitStatusColorsSection() {
  const colors = useGitStatusColors((state) => state.colors);
  const resetColors = useGitStatusColors((state) => state.resetColors);
  return (
    <SettingsSection
      label="Git status colors"
      description="File name colors in the sidebar explorer and the changes list."
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={GIT_STATUS_STATUSES.every(
            (status) => colors[status] === DEFAULT_GIT_STATUS_COLORS[status],
          )}
          onClick={resetColors}
          data-testid="git-colors-reset"
        >
          Reset to defaults
        </Button>
      }
      testId="git-colors"
    >
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {GIT_STATUS_GROUPS.map((group) => (
          <div key={group.label} className="flex min-w-0 flex-col">
            <span className="px-1 pb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
              {group.label}
            </span>
            {group.rows.map((row) => (
              <GitStatusColorRow key={row.status} row={row} />
            ))}
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function GitStatusColorRow({ row }: { row: GitStatusSettingsRow }) {
  const colors = useGitStatusColors((state) => state.colors);
  const setColor = useGitStatusColors((state) => state.setColor);
  const value = colors[row.status];
  return (
    <label className="group/row flex min-w-0 cursor-pointer items-center gap-4 border-border/60 border-b py-2 last:border-b-0">
      <input
        type="color"
        value={value}
        onChange={(event) => setColor(row.status, event.target.value)}
        data-testid={`git-color-${row.status}`}
        aria-label={`${row.label} color`}
        className="sr-only"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-medium text-sm',
          gitStatusColorClass(row.status),
        )}
        style={{ color: value }}
      >
        {row.label}
      </span>
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md transition-shadow group-hover/row:ring-1 group-hover/row:ring-border"
        style={{ backgroundColor: `${value}26` }}
      >
        <span className="size-3.5 rounded-full" style={{ backgroundColor: value }} />
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
        {value}
      </span>
    </label>
  );
}
