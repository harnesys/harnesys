import type { ConnectorPublic } from '@harnesys/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { issueTelegramPairCode } from '../../model/connector-api';
import { formatExpiry, type PairInfo, pairExpiryOf } from './telegram-status';

export function TelegramPairSection({
  orgId,
  connector,
  onChanged,
  onRefresh,
  busy,
}: {
  orgId: string;
  connector: ConnectorPublic;
  onChanged: () => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const [pair, setPair] = useState<PairInfo | null>(null);
  const expiresAt = pairExpiryOf(connector);

  const issue = useMutation({
    mutationFn: () => issueTelegramPairCode(orgId, connector.id),
    onSuccess: (result) => {
      setPair({ pairCode: result.pairCode, pairUrl: result.pairUrl });
      onChanged();
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Could not create a pair link',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px]">Direct messages</span>
          <span className="text-[11px] text-muted-foreground">
            {expiresAt === null
              ? 'Create a link, open it in Telegram, and send /start. Direct messages never reach Harnesys without this step.'
              : `A pair link is active until ${formatExpiry(expiresAt)}. Send /start to the bot to finish.`}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || issue.isPending}
          onClick={() => issue.mutate()}
        >
          {expiresAt === null ? 'Create pair link' : 'New pair link'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRefresh}>
          Check now
        </Button>
      </div>

      {pair ? (
        <div className="flex flex-col gap-1 border-t pt-2 text-xs">
          <a
            href={pair.pairUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-status-info underline-offset-2 hover:underline"
          >
            {pair.pairUrl}
          </a>
          <span className="text-[11px] text-muted-foreground">
            or send <span className="font-mono">{pair.pairCode}</span> to the bot
          </span>
        </div>
      ) : null}

      {expiresAt !== null && pair === null ? (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          The link itself is not stored, only its expiry. Create a new link to copy it again.
        </p>
      ) : null}
    </section>
  );
}
