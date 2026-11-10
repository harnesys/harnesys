import type { AddonPermissionView } from '@harnesys/contracts';
import { CheckIcon } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';

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
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-md border px-3 py-2"
      data-testid={`addon-consent-${permission.id}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {locked ? (
          <CheckIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Required" />
        ) : (
          <Checkbox
            checked={checked}
            onCheckedChange={(next) => onToggle?.(next === true)}
            aria-label={`Grant ${permission.id}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{permission.id}</span>
        <Badge variant={riskVariant(permission.risk)}>{permission.risk}</Badge>
        {permission.optional ? null : <Badge variant="outline">required</Badge>}
      </div>
      <p className="text-muted-foreground text-xs leading-4">{permission.reason}</p>
      {permission.scope && Object.keys(permission.scope).length > 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground leading-4">
          scope: {JSON.stringify(permission.effectiveScope ?? permission.scope)}
        </p>
      ) : null}
    </div>
  );
}

function riskVariant(risk: 'low' | 'medium' | 'high'): 'secondary' | 'outline' | 'destructive' {
  if (risk === 'high') {
    return 'destructive';
  }
  return risk === 'medium' ? 'outline' : 'secondary';
}
