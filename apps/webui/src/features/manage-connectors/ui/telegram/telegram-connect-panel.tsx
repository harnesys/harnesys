import type { ConnectorBindingPublic } from '@harnesys/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@/shared/api';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { connectChat } from '../../model/connector-api';
import { TelegramAgentsPicker } from './telegram-agents-picker';
import { TelegramThreadPicker } from './telegram-thread-picker';

type Mode = 'existing' | 'new';

export function TelegramConnectPanel({
  orgId,
  connectorId,
  binding,
  initialThreadId,
  onConnected,
  onCancel,
}: {
  orgId: string;
  connectorId: string;
  binding: ConnectorBindingPublic;
  initialThreadId?: string | null;
  onConnected: () => void;
  onCancel: () => void;
}) {
  const targetKind = binding.chatType === 'private' ? 'chat' : 'group';
  const isChannel = binding.chatType === 'channel';
  const isDm = binding.chatType === 'private';
  const [mode, setMode] = useState<Mode>(initialThreadId ? 'existing' : 'new');
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null);
  const [title, setTitle] = useState('');
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [autoReplyAgentId, setAutoReplyAgentId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (allowPromote: boolean) => {
      if (mode === 'existing') {
        if (!threadId) {
          throw new Error('Choose a thread first');
        }
        return connectChat(orgId, connectorId, binding.id, {
          mode: 'existing',
          threadId,
          ...(allowPromote ? { allowPromote: true } : {}),
        });
      }
      return connectChat(orgId, connectorId, binding.id, {
        mode: 'new',
        agentIds,
        autoReplyAgentId: isChannel || isDm ? null : autoReplyAgentId,
        ...(title.trim() ? { title: title.trim() } : {}),
      });
    },
    onSuccess: () => {
      onConnected();
      toast.add({ title: 'Chat connected' });
    },
    onError: async (error: unknown) => {
      if (error instanceof ApiError && error.status === 409 && isPromotion(error)) {
        const ok = await alert.confirm({
          title: 'Convert to a group thread?',
          description:
            'This is a 1:1 thread with one agent. Converting it lets the group hold several agents and keeps its history.',
          confirmText: 'Convert and connect',
          testId: 'telegram-promote-dialog',
        });
        if (ok) {
          mutation.mutate(true);
        }
        return;
      }
      toast.add({
        title: 'Could not connect the chat',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  const canSubmit =
    !mutation.isPending && (mode === 'existing' ? threadId !== null : agentIds.length > 0);

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-dashed p-3"
      data-testid="telegram-connect-panel"
    >
      <p className="text-[11px] text-muted-foreground">{connectionHint(targetKind, binding)}</p>
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={mode === 'existing' ? 'secondary' : 'ghost'}
          onClick={() => setMode('existing')}
        >
          Use an existing thread
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'new' ? 'secondary' : 'ghost'}
          onClick={() => setMode('new')}
        >
          Create a new thread
        </Button>
      </div>

      {mode === 'existing' ? (
        <TelegramThreadPicker
          orgId={orgId}
          kind={targetKind}
          value={threadId}
          onChange={setThreadId}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={title}
            aria-label="Thread title"
            placeholder={`Thread title (default: “${binding.title ?? 'Telegram'}”)`}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TelegramAgentsPicker
            orgId={orgId}
            agentIds={agentIds}
            autoReplyAgentId={autoReplyAgentId}
            allowAutoReply={!isChannel}
            single={isDm}
            onAgentIdsChange={setAgentIds}
            onAutoReplyChange={setAutoReplyAgentId}
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={() => mutation.mutate(false)}
        >
          Connect
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function isPromotion(error: ApiError): boolean {
  return error.message.toLowerCase().includes('1:1 thread');
}

function connectionHint(targetKind: 'chat' | 'group', binding: ConnectorBindingPublic): string {
  if (targetKind === 'chat') {
    return 'A direct message connects to a chat thread with exactly one agent.';
  }
  if (binding.chatType === 'channel') {
    return 'New channel posts appear in the thread. Agents answer only when mentioned with @name; channels never auto-reply.';
  }
  return 'One agent can answer every message; the rest answer when mentioned with @name.';
}
