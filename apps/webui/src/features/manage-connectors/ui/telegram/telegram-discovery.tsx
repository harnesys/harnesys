import type { ConnectorBindingPublic, ConnectorPublic } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { orgScopedAgentsQuery } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { RowHeader } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { telegramBotGroupLink } from '../../model/connector-api';
import { TelegramChatRow } from './telegram-chat-row';
import { TelegramPairSection } from './telegram-pair-section';
import { TelegramRegisterChat } from './telegram-register-chat';
import { chatDisplayName, chatKindOf, isTopic } from './telegram-status';

export function TelegramDiscovery({
  orgId,
  connector,
  initialThreadId,
  onChanged,
  onRefresh,
  refreshing,
  busy,
}: {
  orgId: string;
  connector: ConnectorPublic;
  initialThreadId?: string | null;
  onChanged: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  busy: boolean;
}) {
  const agents = useQuery(orgScopedAgentsQuery(orgId));
  const namesById = new Map((agents.data?.items ?? []).map((agent) => [agent.id, agent.name]));
  const [search, setSearch] = useState('');
  const bindings = connector.bindings;
  const needle = search.trim().toLowerCase();
  const visible =
    needle.length === 0 ? bindings : bindings.filter((binding) => matches(binding, needle));

  const dms = visible.filter((binding) => chatKindOf(binding) === 'dm');
  const channels = visible.filter((binding) => chatKindOf(binding) === 'channel');
  const groups = visible.filter((binding) => chatKindOf(binding) === 'group');
  const roots = groups.filter((binding) => !isTopic(binding));
  const topics = groups.filter(isTopic);
  const orphanTopics = topics.filter(
    (topic) => !roots.some((root) => root.chatId === topic.chatId),
  );
  const connected = bindings.filter((binding) => binding.threadId !== null).length;

  return (
    <section className="flex flex-col gap-3" data-testid="telegram-discovery">
      <RowHeader
        label="Chats this bot can see"
        count={bindings.length}
        description="Telegram has no chat list, so this list follows the bot: a chat appears as soon as Telegram reports it."
      >
        <Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? 'Checking…' : 'Refresh'}
        </Button>
      </RowHeader>

      {bindings.length > 3 ? (
        <Input
          value={search}
          aria-label="Search chats"
          placeholder="Search by name or id"
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}

      {bindings.length > 0 && visible.length === 0 ? (
        <p className="px-1 text-muted-foreground text-xs">No chats match this search.</p>
      ) : null}

      <ChatGroup label="Direct messages" count={dms.length}>
        <TelegramPairSection
          orgId={orgId}
          connector={connector}
          onChanged={onChanged}
          onRefresh={onRefresh}
          busy={busy}
        />
        {dms.length === 0 ? (
          <Hint>
            No direct message yet. Create a pair link above, open it, and send /start. The chat
            appears here once Telegram delivers the pairing.
          </Hint>
        ) : null}
        {dms.map((binding) => (
          <TelegramChatRow
            key={binding.id}
            orgId={orgId}
            connector={connector}
            binding={binding}
            namesById={namesById}
            initialThreadId={initialThreadId}
            onChanged={onChanged}
          />
        ))}
      </ChatGroup>

      <ChatGroup
        label="Groups and topics"
        count={groups.length}
        action={
          <a
            href={telegramBotGroupLink(connector.botUsername)}
            target="_blank"
            rel="noreferrer"
            className="text-status-info text-xs underline-offset-2 hover:underline"
          >
            Add to a group
          </a>
        }
      >
        {groups.length === 0 ? (
          <Hint>
            No groups yet. Add @{connector.botUsername} to a group and it appears here on its own. A
            group the bot joined before this connector existed shows up on its first message; add it
            manually below if that is not possible.
          </Hint>
        ) : null}
        {roots.map((root) => (
          <div key={root.id} className="flex flex-col gap-1">
            <TelegramChatRow
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
                  <TelegramChatRow
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
            <TelegramChatRow
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

      <ChatGroup label="Channels" count={channels.length}>
        {channels.length === 0 ? (
          <Hint>
            No channels yet. Add @{connector.botUsername} to a channel as an admin: it can post and
            read new posts there, and answers only when an agent is mentioned.
          </Hint>
        ) : null}
        {channels.map((binding) => (
          <TelegramChatRow
            key={binding.id}
            orgId={orgId}
            connector={connector}
            binding={binding}
            namesById={namesById}
            initialThreadId={initialThreadId}
            onChanged={onChanged}
          />
        ))}
      </ChatGroup>

      <TelegramRegisterChat orgId={orgId} connectorId={connector.id} onAttached={onChanged} />

      <p className="text-[11px] text-muted-foreground">
        {connected} of {bindings.length} chats are connected to threads.
      </p>
    </section>
  );
}

function ChatGroup({
  label,
  count,
  action,
  children,
}: {
  label: string;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-baseline gap-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          {label}
          <span className="font-mono font-normal normal-case tabular-nums">{count}</span>
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground leading-4">
      {children}
    </p>
  );
}

function matches(binding: ConnectorBindingPublic, needle: string): boolean {
  return [chatDisplayName(binding), binding.title ?? '', binding.chatId, binding.topicId ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle);
}
