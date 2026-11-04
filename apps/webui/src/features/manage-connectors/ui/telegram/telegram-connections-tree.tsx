import type { ConnectorBindingPublic, ConnectorPublic } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useOpenThreadTab } from '@/features/ide';
import { orgScopedAgentsQuery } from '@/shared/api';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { toast } from '@/shared/ui/toast';
import { disconnectChat, forgetChat } from '../../model/connector-api';
import { TelegramAttachChat } from './telegram-attach-chat';
import { TelegramConnectWizard } from './telegram-connect-wizard';
import { TelegramCreateTopic } from './telegram-create-topic';
import { agentNamesOf, chatLabel, chatTypeLabel, isGroupChat, isTopic } from './telegram-status';

export function TelegramConnectionsTree({
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
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const openThreadTab = useOpenThreadTab();

  if (connector.bindings.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs" data-testid="telegram-connections-empty">
          No chats yet. Send <span className="font-mono">/start</span> to the bot for a direct
          message, add it to a group, or register a chat by id.
        </p>
        <TelegramAttachChat orgId={orgId} connectorId={connector.id} onAttached={onChanged} />
      </div>
    );
  }

  const roots = connector.bindings.filter((binding) => !isTopic(binding));
  const topics = connector.bindings.filter(isTopic);
  const topicIdsWithoutRoot = [
    ...new Set(
      topics
        .filter((topic) => !roots.some((root) => root.chatId === topic.chatId))
        .map((topic) => topic.chatId),
    ),
  ];

  return (
    <div className="flex flex-col gap-2" data-testid="telegram-connections">
      {roots.map((binding) => (
        <div key={binding.id} className="flex flex-col gap-1">
          <BindingRow
            orgId={orgId}
            connector={connector}
            binding={binding}
            namesById={namesById}
            initialThreadId={initialThreadId}
            connecting={connectingId === binding.id}
            onToggleConnect={() =>
              setConnectingId((current) => (current === binding.id ? null : binding.id))
            }
            onOpenThread={(threadId, agentId) => openThreadTab(orgId, agentId, threadId)}
            onChanged={onChanged}
          />
          {topics
            .filter((topic) => topic.chatId === binding.chatId)
            .map((topic) => (
              <div key={topic.id} className="pl-4">
                <BindingRow
                  orgId={orgId}
                  connector={connector}
                  binding={topic}
                  namesById={namesById}
                  initialThreadId={initialThreadId}
                  connecting={connectingId === topic.id}
                  onToggleConnect={() =>
                    setConnectingId((current) => (current === topic.id ? null : topic.id))
                  }
                  onOpenThread={(threadId, agentId) => openThreadTab(orgId, agentId, threadId)}
                  onChanged={onChanged}
                />
              </div>
            ))}
        </div>
      ))}
      {topicIdsWithoutRoot.map((chatId) => (
        <div key={chatId} className="flex flex-col gap-1 rounded-md border p-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Group {chatId}
          </span>
          {topics
            .filter((topic) => topic.chatId === chatId)
            .map((topic) => (
              <BindingRow
                key={topic.id}
                orgId={orgId}
                connector={connector}
                binding={topic}
                namesById={namesById}
                initialThreadId={initialThreadId}
                connecting={connectingId === topic.id}
                onToggleConnect={() =>
                  setConnectingId((current) => (current === topic.id ? null : topic.id))
                }
                onOpenThread={(threadId, agentId) => openThreadTab(orgId, agentId, threadId)}
                onChanged={onChanged}
              />
            ))}
        </div>
      ))}
      <TelegramAttachChat orgId={orgId} connectorId={connector.id} onAttached={onChanged} />
    </div>
  );
}

function BindingRow({
  orgId,
  connector,
  binding,
  namesById,
  initialThreadId,
  connecting,
  onToggleConnect,
  onOpenThread,
  onChanged,
}: {
  orgId: string;
  connector: ConnectorPublic;
  binding: ConnectorBindingPublic;
  namesById: Map<string, string>;
  initialThreadId?: string | null;
  connecting: boolean;
  onToggleConnect: () => void;
  onOpenThread: (threadId: string, agentId: string) => void;
  onChanged: () => void;
}) {
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
      description: 'The thread stays, but Telegram messages will stop reaching it.',
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
    } catch (error) {
      toast.add({
        title: 'Could not forget the chat',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border px-2 py-1.5"
      data-testid="telegram-binding"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs">
          {chatLabel(binding)}
          <span className="ml-2 text-[11px] text-muted-foreground">
            {chatTypeLabel(binding.chatType)}
          </span>
        </span>
        <RowChip tone={connected ? 'ok' : 'info'}>
          {connected ? 'Connected' : 'Not connected'}
        </RowChip>
      </div>

      {connected ? (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-muted-foreground">
            Thread “{binding.threadTitle ?? binding.threadId}” ·{' '}
            {binding.agentIds.length > 0 ? agentNamesOf(binding.agentIds, namesById) : 'no agents'}
            {binding.autoReplyAgentId
              ? ` · auto-reply ${namesById.get(binding.autoReplyAgentId) ?? binding.autoReplyAgentId}`
              : ' · mention-only'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {binding.threadId && primaryAgentId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenThread(binding.threadId as string, primaryAgentId)}
              >
                Open thread
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={() => void disconnect()}>
              Disconnect
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void forget()}>
              Forget
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" onClick={onToggleConnect}>
              {connecting ? 'Cancel' : 'Connect'}
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
                onToggleConnect();
                onChanged();
              }}
              onCancel={onToggleConnect}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
