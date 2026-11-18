import { threadsForAgent } from '@harnesys/studio-shared';
import { useEffect } from 'react';
import { type Agent, useAgentStore } from '@/entities/agent';
import { type Thread, useThreadStore } from '@/entities/thread';
import { useDeskReady } from '@/features/desk';
import { useOrgId } from '@/shared/config/location';
import { useAssistantChatStore } from './assistant-chat.store';

interface AssistantChatModel {
  orgId: string | null;
  open: boolean;
  ready: boolean;
  agent: Agent | null;
  agents: Agent[];
  threads: Thread[];
  thread: Thread | null;
}

function byCreatedAt(left: Agent, right: Agent): number {
  return left.createdAt.localeCompare(right.createdAt);
}

function byUpdatedAt(left: Thread, right: Thread): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function useAssistantChat(): AssistantChatModel {
  const orgId = useOrgId();
  const open = useAssistantChatStore((state) => state.open);
  const storedAgentId = useAssistantChatStore((state) => state.agentId);
  const threadByAgent = useAssistantChatStore((state) => state.threadByAgent);
  const setAgent = useAssistantChatStore((state) => state.setAgent);
  const agents = useAgentStore((state) => state.items);
  const threads = useThreadStore((state) => state.items);
  const ready = useDeskReady(orgId);
  const orgAgents = orgId ? agents.filter((agent) => agent.orgId === orgId).sort(byCreatedAt) : [];
  const agent = orgAgents.find((item) => item.id === storedAgentId) ?? orgAgents[0] ?? null;
  useEffect(() => {
    if (agent && agent.id !== storedAgentId) {
      setAgent(agent.id);
    }
  }, [agent, setAgent, storedAgentId]);
  const agentThreads = agent
    ? threadsForAgent(threads, agent.id)
        .filter((thread) => thread.kind === 'chat')
        .sort(byUpdatedAt)
    : [];
  const remembered = agent ? threadByAgent[agent.id] : undefined;
  const thread = agentThreads.find((item) => item.id === remembered) ?? agentThreads[0] ?? null;
  return { orgId, open, ready, agent, agents: orgAgents, threads: agentThreads, thread };
}
