import type { WidgetDoc } from '@harnesys/contracts';
import { ShieldAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { type WidgetEffect, type WidgetEffectKind, widgetEffects } from '../model/widget-effects';

const KIND_LABELS: Record<WidgetEffectKind, string> = {
  source: 'Data source',
  callApi: 'API call',
  invokeExternal: 'External invocation',
  vault: 'Vault entry',
};

interface ApproveWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  orgId: string;
  doc: WidgetDoc;
  pending: boolean;
  onConfirm: () => void;
}

function groupEffects(
  effects: WidgetEffect[],
): Array<{ kind: WidgetEffectKind; items: WidgetEffect[] }> {
  const order: WidgetEffectKind[] = ['source', 'callApi', 'invokeExternal', 'vault'];
  return order
    .map((kind) => ({ kind, items: effects.filter((effect) => effect.kind === kind) }))
    .filter((group) => group.items.length > 0);
}

/**
 * Approval gate for an agent-authored draft: every call the widget can make is
 * listed before the user accepts it, and the button stays disabled until the
 * list is acknowledged.
 */
export function ApproveWidgetDialog({
  open,
  onOpenChange,
  title,
  orgId,
  doc,
  pending,
  onConfirm,
}: ApproveWidgetDialogProps): React.ReactNode {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!open) {
      setConfirmed(false);
    }
  }, [open]);
  const groups = groupEffects(widgetEffects(doc, orgId));
  const risky = groups.flatMap((group) => group.items).filter((effect) => effect.risk !== null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layoutKey="approve-widget"
        className="sm:max-w-lg"
        data-testid="approve-widget-dialog"
      >
        <DialogHeader>
          <DialogTitle>Approve "{title}"</DialogTitle>
          <DialogDescription>
            This widget will run with your session. Review every effect before approving.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              No sources and no API calls; this widget runs on local state only.
            </p>
          ) : null}
          {groups.map((group) => (
            <div key={group.kind} className="flex flex-col gap-1">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                {KIND_LABELS[group.kind]}
              </p>
              {group.items.map((effect, index) => (
                <div
                  key={`${effect.label}-${index}`}
                  className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                    {effect.label}
                  </span>
                  {effect.detail ? (
                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">
                      {effect.detail}
                    </span>
                  ) : null}
                  {effect.risk ? (
                    <span className="flex shrink-0 items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] text-destructive uppercase">
                      <ShieldAlertIcon className="size-3" /> {effect.risk}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
          {risky.length > 0 ? (
            <p className="text-[11px] text-destructive">
              {risky.length} effect{risky.length === 1 ? '' : 's'} touch sensitive org resources.
            </p>
          ) : null}
        </div>
        <div className="flex items-start gap-2 text-[12px]">
          <Checkbox
            className="mt-0.5"
            checked={confirmed}
            onCheckedChange={(next) => setConfirmed(Boolean(next))}
            aria-label="I reviewed every call above and approve this widget"
          />
          <span>I reviewed every call above and approve this widget.</span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!confirmed || pending}
            onClick={onConfirm}
            data-testid="approve-widget-confirm"
          >
            Approve widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
