import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import {
  disconnectChat,
  orgConnectorsBaseKey,
  orgConnectorsQuery,
  telegramBotLink,
} from '../../model/connector-api';
import { chatLabel } from './telegram-status';

interface ThreadTelegramBadgeProps {
  orgId: string;
  threadId: string;
  inline?: boolean;
}

function shellClassName(inline: boolean): string {
  return inline
    ? 'flex min-w-0 items-center gap-2 text-xs'
    : 'flex shrink-0 flex-wrap items-center gap-2 border-border/40 border-b px-3 py-1.5 text-xs';
}

export function ThreadTelegramBadge({ orgId, threadId, inline = false }: ThreadTelegramBadgeProps) {
  const queryClient = useQueryClient();
  const connectors = useQuery(orgConnectorsQuery(orgId, { provider: 'telegram' }));
  const items = connectors.data?.items ?? [];
  const route = items
    .flatMap((connector) =>
      connector.bindings
        .filter((binding) => binding.threadId === threadId)
        .map((binding) => ({ connector, binding })),
    )
    .at(0);

  if (connectors.isPending) {
    return null;
  }
  if (!route) {
    if (items.length === 0) {
      return null;
    }
    return (
      <div className={shellClassName(inline)} data-testid="thread-telegram-badge-disconnected">
        {inline ? null : <span className="text-muted-foreground">Not connected to Telegram</span>}
        <Link
          to={`${studioPath.connector(orgId, 'telegram')}?threadId=${encodeURIComponent(threadId)}`}
          className="text-status-info underline-offset-2 hover:underline"
        >
          Connect to Telegram
        </Link>
      </div>
    );
  }

  async function disconnect(): Promise<void> {
    if (!route) {
      return;
    }
    await disconnectChat(orgId, route.connector.id, route.binding.id);
    await queryClient.invalidateQueries({ queryKey: orgConnectorsBaseKey(orgId) });
  }

  return (
    <div className={shellClassName(inline)} data-testid="thread-telegram-badge">
      <span className="min-w-0 truncate">
        Telegram · @{route.connector.botUsername} · {chatLabel(route.binding)}
      </span>
      <a
        href={telegramBotLink(route.connector.botUsername)}
        target="_blank"
        rel="noreferrer"
        className="text-status-info underline-offset-2 hover:underline"
      >
        Open in Telegram
      </a>
      <Button type="button" size="sm" variant="ghost" onClick={() => void disconnect()}>
        Disconnect
      </Button>
    </div>
  );
}
