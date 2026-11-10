import type { AddonGrantEntry, AddonPermissionView } from '@harnesys/contracts';
import { useState } from 'react';
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
  removed = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pending = false,
  onConfirm,
}: ConsentDialogProps) {
  const mandatory = permissions.filter((permission) => !permission.optional);
  const optional = permissions.filter((permission) => permission.optional);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(optional.map((p) => p.id)));

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="addon-consent-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex max-h-[50vh] min-w-0 flex-col gap-2 overflow-y-auto pr-1">
          {permissions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No new rights are requested.</p>
          ) : null}
          {mandatory.map((permission) => (
            <PermissionRow key={permission.id} permission={permission} locked checked />
          ))}
          {optional.map((permission) => (
            <PermissionRow
              key={permission.id}
              permission={permission}
              checked={selected.has(permission.id)}
              onToggle={(checked) => toggle(permission.id, checked)}
            />
          ))}
          {removed.length > 0 ? (
            <div className="rounded-md border px-3 py-2 text-muted-foreground text-xs">
              <p className="font-medium">No longer requested:</p>
              <p>{removed.join(', ')}</p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
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
