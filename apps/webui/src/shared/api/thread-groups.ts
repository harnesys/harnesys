import type { ThreadSummary as ContractThreadSummary } from '@harnesys/contracts';
import type { ThreadHistoryMode, ThreadSummary } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { apiJson } from './client';
import { threadsBase, toStudioSummary } from './threads';

export interface UpdateThreadPolicyInput {
  autoReplyAgentId?: string | null;
  mentionGating?: boolean;
  historyMode?: ThreadHistoryMode;
  historyLast?: number | null;
  historyFromRunId?: string | null;
}

function requireOrgId(): string {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('No active organization');
  }
  return orgId;
}

function threadMutation(
  threadId: string,
  path: string,
  method: 'POST' | 'DELETE' | 'PATCH',
  body?: unknown,
): Promise<ThreadSummary> {
  const orgId = requireOrgId();
  return apiJson<ContractThreadSummary>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}${path}`,
    {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  ).then(toStudioSummary);
}

export function updateThreadPolicy(
  threadId: string,
  input: UpdateThreadPolicyInput,
): Promise<ThreadSummary> {
  return threadMutation(threadId, '/policy', 'PATCH', input);
}

export function addThreadAgent(threadId: string, agentId: string): Promise<ThreadSummary> {
  return threadMutation(threadId, '/agents', 'POST', { agentId });
}

export function removeThreadAgent(threadId: string, agentId: string): Promise<ThreadSummary> {
  return threadMutation(threadId, `/agents/${encodeURIComponent(agentId)}`, 'DELETE');
}

export function addThreadParticipant(threadId: string, userId: string): Promise<ThreadSummary> {
  return threadMutation(threadId, '/participants', 'POST', { userId });
}

export function removeThreadParticipant(
  threadId: string,
  participantId: string,
): Promise<ThreadSummary> {
  return threadMutation(threadId, `/participants/${encodeURIComponent(participantId)}`, 'DELETE');
}
