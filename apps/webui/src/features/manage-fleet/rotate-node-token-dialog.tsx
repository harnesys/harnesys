import type { RotateNodeTokenResponse } from '@harnesys/contracts';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

interface RotateResultData {
  nodeName: string;
  result: RotateNodeTokenResponse;
}

export function openRotateNodeTokenDialog(data: RotateResultData): Promise<void> {
  return dialog
    .open<void, RotateResultData>(RotateNodeTokenDialog, {
      title: `New token for ${data.nodeName}`,
      description:
        'Shown once. The relay stores only a hash, so it cannot be displayed again later.',
      data,
      className: 'sm:max-w-lg',
      cancellable: false,
      testId: 'fleet-rotate-result-dialog',
    })
    .then(() => undefined);
}

function RotateNodeTokenDialog({ onResolve, data }: DialogComponentProps<void, RotateResultData>) {
  const [copied, setCopied] = useState(false);
  const nodeName = data?.nodeName ?? 'this host';
  const token = data?.result.token ?? '';
  const ticketKey = data?.result.ticketKey ?? '';

  const copy = () => {
    void navigator.clipboard.writeText(`Node token: ${token}\nTicket key: ${ticketKey}`);
    setCopied(true);
  };

  return (
    <>
      <p className="text-muted-foreground text-sm leading-relaxed">
        The old token is dead already: {nodeName} cannot authenticate with it anymore. Its current
        connection may stay open until it reconnects, but the worker will not get back in until you
        put this token on that machine. The organization ticket key was rotated too — it is part of
        what the worker needs to accept new tickets.
      </p>
      <dl
        className="grid gap-1.5 rounded-md border bg-background p-3 font-mono text-xs"
        data-testid="fleet-rotate-secret"
      >
        <RotateField label="Node token" value={token} highlight />
        <RotateField label="Ticket key" value={ticketKey} />
      </dl>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={copy} data-testid="fleet-rotate-copy">
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? 'Copied' : 'Copy token'}
        </Button>
        <Button type="button" onClick={() => onResolve?.()} data-testid="fleet-rotate-done">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function RotateField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`min-w-0 select-all break-all ${highlight ? 'font-medium text-foreground' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
