import type {
  ConnectorBindingPublic,
  ConnectorCapabilities,
  ThreadMember,
} from '@harnesys/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const CHAT_LABEL: Record<string, string> = {
  private: 'Direct message',
  group: 'Group',
  supergroup: 'Supergroup',
  channel: 'Channel',
};

const MENTIONS_ONLY = 'mentions';

function chatLabel(binding: ConnectorBindingPublic): string {
  const base = binding.title || CHAT_LABEL[binding.chatType] || binding.chatType;
  return binding.topicId ? `${base} · topic ${binding.topicId}` : base;
}

export function ConnectorBindings({
  bindings,
  capabilities,
  agents,
  disabled,
  onConnect,
  onDisconnect,
  onOpenThread,
}: {
  bindings: ConnectorBindingPublic[];
  capabilities: ConnectorCapabilities;
  agents: ThreadMember[];
  disabled: boolean;
  onConnect: (bindingId: string, autoReplyAgentId: string | null) => void;
  onDisconnect: (bindingId: string) => void;
  onOpenThread: (threadId: string) => void;
}) {
  if (bindings.length === 0) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="connector-bindings-empty">
        No chats linked yet. Open the bot link and send /start in Telegram.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="connector-bindings">
      {bindings.map((binding) => (
        <BindingRow
          key={binding.id}
          binding={binding}
          capabilities={capabilities}
          agents={agents}
          disabled={disabled}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onOpenThread={onOpenThread}
        />
      ))}
    </div>
  );
}

function BindingRow({
  binding,
  capabilities,
  agents,
  disabled,
  onConnect,
  onDisconnect,
  onOpenThread,
}: {
  binding: ConnectorBindingPublic;
  capabilities: ConnectorCapabilities;
  agents: ThreadMember[];
  disabled: boolean;
  onConnect: (bindingId: string, autoReplyAgentId: string | null) => void;
  onDisconnect: (bindingId: string) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const [autoReply, setAutoReply] = useState<string>(() =>
    agents.length === 1 && capabilities.canReadUnmentioned
      ? (agents[0]?.id ?? MENTIONS_ONLY)
      : MENTIONS_ONLY,
  );
  const connected = binding.threadId !== null;

  return (
    <div
      className="flex flex-col gap-2 rounded-md border px-2 py-1.5"
      data-testid="connector-binding"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs">{chatLabel(binding)}</span>
        <RowChip tone={connected ? 'ok' : 'info'}>
          {connected ? 'Connected' : 'Not connected'}
        </RowChip>
      </div>
      {connected && binding.threadId ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => binding.threadId && onOpenThread(binding.threadId)}
          >
            Open thread
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onDisconnect(binding.id)}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={autoReply} onValueChange={(value) => setAutoReply(value ?? MENTIONS_ONLY)}>
            <SelectTrigger size="sm" className="min-w-40" aria-label="Auto-reply agent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MENTIONS_ONLY}>Mentions only</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={disabled || agents.length === 0}
            onClick={() => onConnect(binding.id, autoReply === MENTIONS_ONLY ? null : autoReply)}
          >
            Connect
          </Button>
        </div>
      )}
    </div>
  );
}
