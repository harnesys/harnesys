import type { AddonGrantEntry, AddonPermissionView } from '@harnesys/contracts';
import { type ReactNode, useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { PermissionRow } from './consent-rows';
import { grantsFromBody } from './lib/grant-diff';

export interface ConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  permissions: AddonPermissionView[];
  /** Right ids that are already granted; optional rights start checked. */
  initialGranted?: readonly string[];
  /** Removed right ids shown when an update narrows the grant set. */
  removed?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: (grants: AddonGrantEntry[]) => void;
}

export function ConsentDialog({
  open,
  onOpenChange,
  title,
  description,
  permissions,
  initialGranted = [],
  removed = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pending = false,
  onConfirm,
}: ConsentDialogProps) {
  const mandatory = permissions.filter((permission) => !permission.optional);
  const optional = permissions.filter((permission) => permission.optional);
  // Least privilege: optional permissions start unchecked unless they are already granted.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialGranted));

  if (!open) {
    return null;
  }

  const toggle = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const confirm = () => {
    onConfirm(grantsFromBody(permissions, selected));
  };

  const grantedCount = mandatory.length + optional.filter((p) => selected.has(p.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="addon-consent-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex max-h-[55vh] min-w-0 flex-col gap-1 overflow-y-auto pr-1">
          {permissions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No new rights are requested.</p>
          ) : null}
          {mandatory.length > 0 ? (
            <ConsentGroup label="Required" count={mandatory.length}>
              {mandatory.map((permission) => (
                <PermissionRow key={permission.id} permission={permission} locked checked />
              ))}
            </ConsentGroup>
          ) : null}
          {optional.length > 0 ? (
            <ConsentGroup label="Optional" count={optional.length}>
              {optional.map((permission) => (
                <PermissionRow
                  key={permission.id}
                  permission={permission}
                  checked={selected.has(permission.id)}
                  onToggle={(checked) => toggle(permission.id, checked)}
                />
              ))}
            </ConsentGroup>
          ) : null}
          {removed.length > 0 ? (
            <div className="mt-1 rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
              <p className="font-medium">No longer requested:</p>
              <p className="font-mono text-[11px]">{removed.join(', ')}</p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          {optional.length > 0 ? (
            <p
              className="mr-auto text-muted-foreground text-xs tabular-nums"
              data-testid="addon-consent-summary"
            >
              {grantedCount} of {permissions.length} rights granted
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            data-testid="addon-consent-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={confirm}
            data-testid="addon-consent-confirm"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsentGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <p className="sticky top-0 z-10 flex items-baseline gap-1.5 bg-popover py-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
        <span className="font-mono font-normal normal-case tabular-nums">{count}</span>
      </p>
      {children}
    </div>
  );
}
