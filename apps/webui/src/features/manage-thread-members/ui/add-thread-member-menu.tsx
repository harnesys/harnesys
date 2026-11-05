import { useQuery } from '@tanstack/react-query';
import { UserPlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useAgentStore } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { addThreadAgent, addThreadParticipant } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { membersQuery } from '@/shared/api/members';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { mutateThread } from '../model/thread-members-mutation';

export function AddThreadMemberMenu({ thread }: { thread: Thread }) {
  const orgId = getActiveOrgId();
  const agents = useAgentStore((state) => state.items);
  const users = useQuery({ ...membersQuery(orgId ?? ''), enabled: Boolean(orgId) });
  const [agentId, setAgentId] = useState('');
  const [userId, setUserId] = useState('');
  const [open, setOpen] = useState(false);
  const agentFieldId = useId();
  const userFieldId = useId();
  const members = thread.members ?? [];
  const participants = thread.participants ?? [];
  const memberIds = new Set(members.map((member) => member.id));
  const participantIds = new Set(participants.map((participant) => participant.providerUserId));
  const availableAgents = agents.filter(
    (agent) => agent.orgId === orgId && !memberIds.has(agent.id),
  );
  const availableUsers = (users.data ?? []).filter((user) => !participantIds.has(user.userId));
  const addAgent = () => {
    const id = agentId;
    setAgentId('');
    setOpen(false);
    void mutateThread(() => addThreadAgent(thread.id, id));
  };
  const addUser = () => {
    const id = userId;
    setUserId('');
    setOpen(false);
    void mutateThread(() => addThreadParticipant(thread.id, id));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add member"
            title="Add member"
          />
        }
      >
        <UserPlusIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <p className="font-medium text-sm">Add to group</p>
        <Field>
          <FieldLabel htmlFor={agentFieldId}>Agent</FieldLabel>
          <Select
            items={availableAgents.map((agent) => ({ value: agent.id, label: agent.name }))}
            value={agentId || null}
            onValueChange={(value) => setAgentId(value ?? '')}
          >
            <SelectTrigger id={agentFieldId} size="sm" className="w-full">
              <SelectValue placeholder="Select an agent…" />
            </SelectTrigger>
            <SelectContent align="start">
              {availableAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableAgents.length === 0 ? (
            <FieldDescription>Every agent is already here.</FieldDescription>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={!agentId}
            onClick={addAgent}
          >
            Add agent
          </Button>
        </Field>
        <Field>
          <FieldLabel htmlFor={userFieldId}>Person</FieldLabel>
          <Select
            items={availableUsers.map((user) => ({
              value: user.userId,
              label: user.name || user.login,
            }))}
            value={userId || null}
            onValueChange={(value) => setUserId(value ?? '')}
          >
            <SelectTrigger id={userFieldId} size="sm" className="w-full">
              <SelectValue placeholder="Select a person…" />
            </SelectTrigger>
            <SelectContent align="start">
              {availableUsers.map((user) => (
                <SelectItem key={user.userId} value={user.userId}>
                  {user.name || user.login}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableUsers.length === 0 ? (
            <FieldDescription>Everyone in the org is already here.</FieldDescription>
          ) : null}
          <Button type="button" size="xs" variant="secondary" disabled={!userId} onClick={addUser}>
            Add person
          </Button>
        </Field>
      </PopoverContent>
    </Popover>
  );
}
