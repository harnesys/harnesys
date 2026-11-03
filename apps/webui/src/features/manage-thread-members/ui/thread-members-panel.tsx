import type { ThreadSummary } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { UsersIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useAgentStore } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { toClientThread, useThreadStore } from '@/entities/thread';
import {
  addThreadAgent,
  addThreadParticipant,
  removeThreadAgent,
  removeThreadParticipant,
  updateThreadPolicy,
} from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { membersQuery } from '@/shared/api/members';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

function applySummary(summary: ThreadSummary): void {
  const store = useThreadStore.getState();
  const current = store.byId(summary.id);
  const next = toClientThread(summary);
  store.upsert(current ? { ...current, ...next } : next);
}

async function mutate(run: () => Promise<ThreadSummary>): Promise<void> {
  try {
    applySummary(await run());
  } catch (error) {
    toast.add({
      title: 'Could not update group',
      description: error instanceof Error ? error.message : 'Request failed',
    });
  }
}

export function ThreadMembersPanel({ thread }: { thread: Thread }) {
  const orgId = getActiveOrgId();
  const agents = useAgentStore((state) => state.items);
  const members = thread.members ?? [];
  const participants = thread.participants ?? [];
  const users = useQuery({ ...membersQuery(orgId ?? ''), enabled: Boolean(orgId) });
  const policy = thread.policy;
  const [agentId, setAgentId] = useState('');
  const [userId, setUserId] = useState('');
  const [contextWindow, setContextWindow] = useState(String(policy?.contextWindow ?? ''));
  const memberIds = new Set(members.map((member) => member.id));
  const participantIds = new Set(participants.map((participant) => participant.providerUserId));
  const availableAgents = agents.filter(
    (agent) => agent.orgId === orgId && !memberIds.has(agent.id),
  );
  const availableUsers = (users.data ?? []).filter((user) => !participantIds.has(user.userId));

  return (
    <div className="flex flex-wrap items-center gap-2 border-border/40 border-b px-4 py-2 text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        <UsersIcon className="size-3.5" aria-hidden />
        Agents
      </span>
      {members.map((member) => (
        <span
          key={member.id}
          className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground"
        >
          {member.name}
          <button
            type="button"
            aria-label={`Remove ${member.name}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => void mutate(() => removeThreadAgent(thread.id, member.id))}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <select
        className="h-6 rounded-md border border-border/60 bg-background px-1"
        value={agentId}
        aria-label="Agent to add"
        onChange={(event) => setAgentId(event.target.value)}
      >
        <option value="">Add agent…</option>
        {availableAgents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={!agentId}
        onClick={() => {
          const id = agentId;
          setAgentId('');
          void mutate(() => addThreadAgent(thread.id, id));
        }}
      >
        Add
      </Button>

      <span className="ml-2 text-muted-foreground">Users</span>
      {participants.map((participant) => (
        <span
          key={participant.id}
          className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground"
        >
          {participant.displayName}
          <button
            type="button"
            aria-label={`Remove ${participant.displayName}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => void mutate(() => removeThreadParticipant(thread.id, participant.id))}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <select
        className="h-6 rounded-md border border-border/60 bg-background px-1"
        value={userId}
        aria-label="User to add"
        onChange={(event) => setUserId(event.target.value)}
      >
        <option value="">Add user…</option>
        {availableUsers.map((user) => (
          <option key={user.userId} value={user.userId}>
            {user.name || user.login}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={!userId}
        onClick={() => {
          const id = userId;
          setUserId('');
          void mutate(() => addThreadParticipant(thread.id, id));
        }}
      >
        Add
      </Button>

      <label className="ml-2 flex items-center gap-1 text-muted-foreground">
        Auto-reply
        <select
          className="h-6 rounded-md border border-border/60 bg-background px-1"
          value={thread.autoReplyAgentId ?? ''}
          aria-label="Auto-reply agent"
          onChange={(event) =>
            void mutate(() =>
              updateThreadPolicy(thread.id, { autoReplyAgentId: event.target.value || null }),
            )
          }
        >
          <option value="">None</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-muted-foreground">
        Window
        <input
          type="number"
          min={1}
          className="h-6 w-16 rounded-md border border-border/60 bg-background px-1"
          value={contextWindow}
          aria-label="Group context window"
          onChange={(event) => setContextWindow(event.target.value)}
        />
      </label>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={() => {
          const value = Number(contextWindow);
          void mutate(() =>
            updateThreadPolicy(
              thread.id,
              Number.isFinite(value) && value > 0 ? { contextWindow: value } : {},
            ),
          );
        }}
      >
        Save
      </Button>
      <label className="flex items-center gap-1 text-muted-foreground">
        <input
          type="checkbox"
          checked={policy?.mentionGating ?? false}
          aria-label="Ignore mentions"
          onChange={(event) =>
            void mutate(() =>
              updateThreadPolicy(thread.id, { mentionGating: event.target.checked }),
            )
          }
        />
        Ignore @mentions
      </label>
    </div>
  );
}
