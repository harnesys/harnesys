import { Button } from '@/shared/ui/button';

export function ApprovalButtons({
  busy,
  onDeny,
  onAllowOnce,
  onAllowRun,
  onAlwaysAllow,
  alwaysAllowDisabled,
  alwaysAllowReason,
  denyLabel = 'Deny',
}: {
  busy: boolean;
  onDeny?: () => void;
  onAllowOnce?: () => void;
  onAllowRun?: () => void;
  onAlwaysAllow: () => void;
  alwaysAllowDisabled: boolean;
  alwaysAllowReason?: string;
  denyLabel?: string;
}) {
  const alwaysDisabled = busy || alwaysAllowDisabled;
  return (
    <div className="flex flex-1 items-center gap-1">
      {onDeny ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy}
          className="h-7"
          onClick={onDeny}
        >
          {denyLabel}
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        {onAllowOnce ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="h-7"
            onClick={onAllowOnce}
          >
            Allow once
          </Button>
        ) : null}
        {onAllowRun ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="h-7"
            onClick={onAllowRun}
          >
            Allow this run
          </Button>
        ) : null}
        <span
          className="flex"
          title={alwaysAllowDisabled && alwaysAllowReason ? alwaysAllowReason : undefined}
        >
          <Button
            type="button"
            size="sm"
            disabled={alwaysDisabled}
            className="h-7"
            onClick={onAlwaysAllow}
          >
            Always allow
          </Button>
        </span>
      </div>
    </div>
  );
}
