import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { orgConnectorsQuery } from '@/features/manage-connectors/model/connector-api';
import { chatLabel } from '@/features/manage-connectors/ui/telegram/telegram-status';
import { studioPath } from '@/shared/config/routes';
import { Pane } from '@/shared/ui/capability-rows';
import { RowListSkeleton } from '@/shared/ui/settings-kit';

export function AgentTelegramInfo({ orgId, agentId }: { orgId: string; agentId: string }) {
  const connectors = useQuery(orgConnectorsQuery(orgId, { agentId }));
  const routes = (connectors.data?.items ?? []).flatMap((connector) =>
    connector.bindings
      .filter((binding) => binding.agentIds.includes(agentId))
      .map((binding) => ({ connector, binding })),
  );

  return (
    <Pane
      testId="agent-telegram-info"
      label="Telegram"
      description="Where this agent answers. Bots and chats are managed in Settings → Connectors → Telegram."
    >
      {connectors.isPending ? <RowListSkeleton testId="agent-telegram-loading" /> : null}
      {!connectors.isPending && routes.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="agent-telegram-empty">
          This agent is not connected to Telegram. An organization admin can connect it in Settings
          → Connectors → Telegram.
        </p>
      ) : null}
      {routes.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-testid="agent-telegram-routes">
          {routes.map(({ connector, binding }) => (
            <div
              key={`${connector.id}:${binding.id}`}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate">
                @{connector.botUsername} · {chatLabel(binding)}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {binding.autoReplyAgentId === agentId ? 'auto-reply' : 'mention-only'}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <Link
        to={studioPath.connector(orgId, 'telegram')}
        className="text-status-info text-xs underline-offset-2 hover:underline"
      >
        Open Telegram settings
      </Link>
    </Pane>
  );
}
