import type { ConnectorBindingPublic, ConnectorPublic } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useOpenThreadTab } from '@/features/ide';
import { orgScopedAgentsQuery } from '@/shared/api';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip, RowHeader } from '@/shared/ui/capability-rows';
import { toast } from '@/shared/ui/toast';
import { disconnectChat, forgetChat } from '../../model/connector-api';
import { TelegramAttachChat } from './telegram-attach-chat';
import { TelegramConnectWizard } from './telegram-connect-wizard';
import { TelegramCreateTopic } from './telegram-create-topic';
import { agentNamesOf, chatTypeLabel, isGroupChat, isTopic } from './telegram-status';

export function TelegramDiscovery({
  orgId,
  connector,
  initialThreadId,
  onChanged,
}: {
  orgId: string;
  connector: ConnectorPublic;
  initialThreadId?: string | null;
  onChanged: () => void;
}) {
  const agents = useQuery(orgScopedAgentsQuery(orgId));
  const namesById = new Map((agents.data?.items ?? []).map((agent) => [agent.id, agent.name]));
  const bindings = connector.bindings;
  const dms = bindings.filter((binding) => binding.chatType === 'private');
  const channels = bindings.filter((binding) => binding.chatType === 'channel');
  const groups = bindings.filter((binding) => isGroupChat(binding.chatType));
  const roots = groups.filter((binding) => !isTopic(binding));
  const topics = groups.filter(isTopic);
  const orphanTopics = topics.filter(
    (topic) => !roots.some((root) => root.chatId === topic.chatId),
  );
  const connected = bindings.filter((binding) => binding.threadId !== null).length;
  const bot = `@${connector.botUsername}`;

  return (
    <div className="flex flex-col gap-5" data-testid="telegram-discovery">
      <ChatGroup
        label="Direct messages"
        count={dms.length}
        description="Someone messaging the bot privately. Pair first, then connect the chat to a 1:1 thread."
      >
        {dms.length === 0 ? (
          <p className="px-2 text-muted-foreground text-xs" data-testid="telegram-dm-empty">
            No direct messages yet. Use “Pair direct messages” above, then send /start to {bot}.
          </p>
        ) : (
          dms.map((binding) => (
            <ChatRow
              key={binding.id}
              orgId={orgId}
              connector={connector}
              binding={binding}
              namesById={namesById}
              initialThreadId={initialThreadId}
              onChanged={onChanged}
            />
          ))
        )}
      </ChatGroup>

      <ChatGroup
        label="Groups and topics"
        count={groups.length}
        description={`Add ${bot} to a group as an admin. The group and its forum topics appear here on their own.`}
        actions={
          <TelegramAttachChat orgId={orgId} connectorId={connector.id} onAttached={onChanged} />
        }
      >
        {groups.length === 0 ? (
          <p className="px-2 text-muted-foreground text-xs" data-testid="telegram-groups-empty">
            No groups yet. Add {bot} to a group, or register a private group by its numeric id.
          </p>
        ) : null}
        {roots.map((root) => (
          <div key={root.id} className="flex flex-col gap-1">
            <ChatRow
              orgId={orgId}
              connector={connector}
              binding={root}
              namesById={namesById}
              initialThreadId={initialThreadId}
              onChanged={onChanged}
            />
            {topics
              .filter((topic) => topic.chatId === root.chatId)
              .map((topic) => (
                <div key={topic.id} className="ml-3 border-border/60 border-l pl-3">
                  <ChatRow
                    orgId={orgId}
                    connector={connector}
                    binding={topic}
                    namesById={namesById}
                    initialThreadId={initialThreadId}
                    onChanged={onChanged}
                  />
                </div>
              ))}
          </div>
        ))}
        {orphanTopics.map((topic) => (
          <div key={topic.id} className="ml-3 border-border/60 border-l pl-3">
            <ChatRow
              orgId={orgId}
              connector={connector}
              binding={topic}
              namesById={namesById}
              initialThreadId={initialThreadId}
              onChanged={onChanged}
            />
          </div>
        ))}
      </ChatGroup>

      <ChatGroup
        label="Channels"
        count={channels.length}
        description={`Add ${bot} to a channel as an admin. It can post, edit, pin, and read new posts there; replies happen only when an agent is mentioned.`}
      >
        {channels.length === 0 ? (
          <p className="px-2 text-muted-foreground text-xs" data-testid="telegram-channels-empty">
            No channels yet. Add {bot} as a channel admin, or register a public channel by its
            @username.
          </p>
        ) : (
          channels.map((binding) => (
            <ChatRow
              key={binding.id}
              orgId={orgId}
              connector={connector}
              binding={binding}
              namesById={namesById}
              initialThreadId={initialThreadId}
              onChanged={onChanged}
            />
          ))
        )}
      </ChatGroup>

      <p className="text-[11px] text-muted-foreground">
        {connected} of {bindings.length} chats are connected to threads.
      </p>
    </div>
  );
}

function ChatGroup({
  label,
  count,
  description,
  actions,
  children,
}: {
  label: string;
  count: number;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <RowHeader label={label} count={count} description={description}>
        {actions}
      </RowHeader>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function ChatRow({
  orgId,
  connector,
  binding,
  namesById,
  initialThreadId,
  onChanged,
}: {
  orgId: string;
  connector: ConnectorPublic;
  binding: ConnectorBindingPublic;
  namesById: Map<string, string>;
  initialThreadId?: string | null;
  onChanged: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const openThreadTab = useOpenThreadTab();
  const connected = binding.threadId !== null;
  const primaryAgentId = binding.autoReplyAgentId ?? binding.agentIds[0] ?? null;

  async function disconnect(): Promise<void> {
    try {
      await disconnectChat(orgId, connector.id, binding.id);
      onChanged();
      toast.add({ title: 'Chat disconnected' });
    } catch (error) {
      toast.add({
        title: 'Could not disconnect',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  async function forget(): Promise<void> {
    const ok = await alert.confirm({
      title: 'Forget this chat?',
      description:
        'The thread and its history stay in Harnesys, but Telegram messages stop reaching it. If the bot is still in the chat, it will appear here again after the next update.',
      confirmText: 'Forget',
      variant: 'destructive',
      testId: 'telegram-forget-chat-dialog',
    });
    if (!ok) {
      return;
    }
    try {
      await forgetChat(orgId, connector.id, binding.id);
      onChanged();
      toast.add({ title: 'Chat forgotten' });
    } catch (error) {
      toast.add({
        title: 'Could not forget the chat',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border bg-card/40 px-2.5 py-2"
      data-testid="telegram-binding"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="min-w-0 truncate text-[13px]">{chatLabelOf(binding)}</span>
          <span className="text-[11px] text-muted-foreground">
            {chatTypeLabel(binding.chatType)}
          </span>
        </div>
        <RowChip tone={connected ? 'ok' : 'info'}>
          {connected ? 'Connected' : 'Not connected'}
        </RowChip>
      </div>

      {connected ? (
        <ConnectedDetails
          binding={binding}
          namesById={namesById}
          onOpen={() => {
            if (binding.threadId && primaryAgentId) {
              openThreadTab(orgId, primaryAgentId, binding.threadId);
            }
          }}
          onDisconnect={() => void disconnect()}
          onForget={() => void forget()}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" onClick={() => setConnecting((open) => !open)}>
              {connecting ? 'Cancel' : 'Connect to a thread'}
            </Button>
            {isGroupChat(binding.chatType) && !isTopic(binding) ? (
              <TelegramCreateTopic
                orgId={orgId}
                connectorId={connector.id}
                bindingId={binding.id}
                onCreated={onChanged}
              />
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={() => void forget()}>
              Forget
            </Button>
          </div>
          {connecting ? (
            <TelegramConnectWizard
              orgId={orgId}
              connectorId={connector.id}
              binding={binding}
              initialThreadId={initialThreadId}
              onConnected={() => {
                setConnecting(false);
                onChanged();
              }}
              onCancel={() => setConnecting(false)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ConnectedDetails({
  binding,
  namesById,
  onOpen,
  onDisconnect,
  onForget,
}: {
  binding: ConnectorBindingPublic;
  namesById: Map<string, string>;
  onOpen: () => void;
  onDisconnect: () => void;
  onForget: () => void;
}) {
  const routing =
    binding.agentIds.length > 0 ? agentNamesOf(binding.agentIds, namesById) : 'no agents yet';
  const mode = binding.autoReplyAgentId
    ? `every message → ${namesById.get(binding.autoReplyAgentId) ?? binding.autoReplyAgentId}`
    : 'agents answer when mentioned';
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-muted-foreground">
        <span className="text-foreground/80">
          Thread “{binding.threadTitle ?? binding.threadId}”
        </span>
        {' · '}
        {routing}
        {' · '}
        {mode}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!binding.threadId}
          onClick={onOpen}
        >
          Open thread
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDisconnect}>
          Disconnect
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onForget}>
          Forget
        </Button>
      </div>
    </div>
  );
}

function chatLabelOf(binding: ConnectorBindingPublic): string {
  const title = binding.title || chatTypeLabel(binding.chatType);
  if (binding.topicId) {
    return `#${title}`;
  }
  return title;
}
