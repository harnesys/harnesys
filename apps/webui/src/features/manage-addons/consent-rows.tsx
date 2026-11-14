import type { AddonPermissionView } from '@harnesys/contracts';
import { LockIcon, ShieldIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { RowChip } from '@/shared/ui/capability-rows';
import { Checkbox } from '@/shared/ui/checkbox';
import { PERMISSION_RISK_TONE } from './lib/permission-risk';

export function PermissionRow({
  permission,
  checked = false,
  locked = false,
  onToggle,
}: {
  permission: AddonPermissionView;
  checked?: boolean;
  locked?: boolean;
  onToggle?: (checked: boolean) => void;
}) {
  const toggleable = onToggle !== undefined;
  const display = !toggleable && !locked;
  const body = <PermissionBody permission={permission} display={display} />;
  return (
    <div
      className={cn(
        '-mx-1 flex min-w-0 items-start gap-2 rounded-md px-1 py-1.5 transition-colors',
        toggleable && 'hover:bg-muted/40',
      )}
      data-testid={`addon-consent-${permission.id}`}
    >
      <PermissionControl
        permission={permission}
        checked={checked}
        locked={locked}
        toggleable={toggleable}
        onToggle={onToggle}
      />
      {toggleable ? (
        <button
          type="button"
          onClick={() => onToggle(!checked)}
          className="flex min-w-0 flex-1 flex-col text-left"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">{body}</div>
      )}
    </div>
  );
}

function PermissionBody({
  permission,
  display,
}: {
  permission: AddonPermissionView;
  display: boolean;
}) {
  const scope = permission.effectiveScope ?? permission.scope;
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 py-px">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-5">
          {permission.id}
        </span>
        {display ? <PermissionModeChip permission={permission} /> : null}
        <RowChip tone={PERMISSION_RISK_TONE[permission.risk]}>{permission.risk}</RowChip>
      </span>
      <span className="text-muted-foreground text-xs leading-4">{permission.reason}</span>
      {scope && Object.keys(scope).length > 0 ? <ScopeLine scope={scope} /> : null}
    </>
  );
}

function ScopeLine({ scope }: { scope: Record<string, unknown> }) {
  return (
    <span className="flex min-w-0 gap-3 font-mono text-[11px] text-muted-foreground/70 leading-4">
      {Object.entries(scope).map(([key, value]) => (
        <span key={key} className="min-w-0 truncate">
          {key}: {formatScopeValue(value)}
        </span>
      ))}
    </span>
  );
}

function formatScopeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ');
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function PermissionControl({
  permission,
  checked,
  locked,
  toggleable,
  onToggle,
}: {
  permission: AddonPermissionView;
  checked: boolean;
  locked: boolean;
  toggleable: boolean;
  onToggle?: (checked: boolean) => void;
}) {
  if (locked) {
    return (
      <LockIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground/60" aria-label="Required" />
    );
  }
  if (toggleable) {
    return (
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle?.(!checked)}
        aria-label={`Grant ${permission.id}`}
        className="mt-0.5"
      />
    );
  }
  return <ShieldIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />;
}

function PermissionModeChip({ permission }: { permission: AddonPermissionView }) {
  if (permission.optional) {
    return <RowChip>optional</RowChip>;
  }
  return <RowChip tone="info">required</RowChip>;
}
