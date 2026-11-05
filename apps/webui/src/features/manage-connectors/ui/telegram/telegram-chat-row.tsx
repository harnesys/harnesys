import type { ConnectorBindingPublic, ConnectorPublic } from '@harnesys/contracts';
import { useMutation } from '@tanstack/react-query';
import { ExternalLinkIcon, MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import { useOpenThreadTab } from '@/features/ide';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { disconnectChat, forgetChat, renameChat, telegramBotLink } from '../../model/connector-api';
import { TelegramConnectPanel } from './telegram-connect-panel';
import { TelegramCreateTopic } from './telegram-create-topic';
import {
  agentNamesOf,
  chatDisplayName,
  chatTypeLabel,
  isGroupChat,
  isTopic,
  isUnnamedTitle,
} from './telegram-status';

export function TelegramChatRow({
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
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(binding.title ?? '');
  const openThreadTab = useOpenThreadTab();
  const connected = binding.threadId !== null;
  const primaryAgentId = binding.autoReplyAgentId ?? binding.agentIds[0] ?? null;

  const rename = useMutation({
    mutationFn: () => renameChat(orgId, connector.id, binding.id, { title: title.trim() }),
    onSuccess: () => {
      setRenaming(false);
      onChanged();
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Could not rename the chat',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  async function disconnect(): Promise<void> {
    try {
      await disconnectChat(orgId, connector.id, binding.id);
      onChanged();
      toast.add({
        title: 'Chat disconnected',
        description: 'Messages stop reaching the thread. The thread and its history stay.',
      });
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
        'Telegram messages stop reaching the thread and the chat leaves this list. It reappears if the bot is still in the chat and receives a new update.',
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
      {' '}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate font-medium text-[13px]">
              {chatDisplayName(binding)}
            </span>
            {isUnnamedTitle(binding) ? <RowChip tone="warn">no name</RowChip> : null}
          </div>
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {chatTypeLabel(binding.chatType)} · {binding.chatId}
            {binding.topicId ? ` · topic ${binding.topicId}` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <RowChip tone={connected ? 'ok' : 'info'}>
            {connected ? 'Connected' : 'Not connected'}
          </RowChip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Chat actions"
                  data-testid="telegram-chat-menu"
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setTitle(binding.title ?? '');
                  setRenaming((open) => !open);
                }}
              >
                Rename
              </DropdownMenuItem>
              {connected ? (
                <DropdownMenuItem onClick={() => void disconnect()}>Disconnect</DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void forget()}>
                Forget chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {renaming ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) {
              rename.mutate();
            }
          }}
        >
          <Input
            value={title}
            aria-label="Chat name"
            placeholder="Name shown in Harnesys"
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!title.trim() || rename.isPending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
      {connected ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-muted-foreground">
            <span className="text-foreground/80">
              Thread “{binding.threadTitle ?? binding.threadId}”
            </span>
            {' · '}
            {routingLabel(binding, namesById)}
            {' · '}
            {modeLabel(binding, namesById)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!binding.threadId || !primaryAgentId}
              onClick={() => {
                if (binding.threadId && primaryAgentId) {
                  openThreadTab(orgId, primaryAgentId, binding.threadId);
                }
              }}
            >
              Open thread
            </Button>
            <a
              href={telegramBotLink(connector.botUsername)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 text-[11px] text-status-info underline-offset-2 hover:underline"
            >
              <ExternalLinkIcon className="size-3" aria-hidden />
              Telegram
            </a>
          </div>
        </div>
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
          </div>
          {connecting ? (
            <TelegramConnectPanel
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

function routingLabel(binding: ConnectorBindingPublic, namesById: Map<string, string>): string {
  if (binding.agentIds.length === 0) {
    return 'no agents yet';
  }
  return isTopic(binding)
    ? `${agentNamesOf(binding.agentIds, namesById)} in this topic`
    : agentNamesOf(binding.agentIds, namesById);
}

function modeLabel(binding: ConnectorBindingPublic, namesById: Map<string, string>): string {
  if (binding.autoReplyAgentId) {
    const name = namesById.get(binding.autoReplyAgentId) ?? binding.autoReplyAgentId;
    return `every message → ${name}`;
  }
  return 'agents answer when mentioned';
}
