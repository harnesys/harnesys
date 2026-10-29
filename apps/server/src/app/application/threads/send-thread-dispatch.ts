import type { AcceptedRunResponse } from '@harnesys/contracts';
import type { Attachment } from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { PlacementResult, RunIsolation } from '../../domain/fleet/placement.ts';
import type { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type { IssueRemoteRunUseCase } from '../fleet/issue-remote-run.use-case.ts';
import { toPlacementEvent } from './resolve-run-placement.ts';
import { attributedRun } from './run-attribution.ts';
import type { AttachmentMeta } from './send-thread-attachments.ts';
import type { SendThreadRunRequest } from './send-thread-run.use-case.ts';
import type { WorktreeBinding } from './send-thread-worktree.ts';

export interface SharedRunFields {
  directory?: string;
  sourceId?: string;
  worktreeId?: string;
  isolation?: RunIsolation;
}

export function workspaceRefs(
  binding: WorktreeBinding | null,
  sourceId: string | undefined,
): { sourceId?: string; worktreeId?: string } {
  if (binding !== null) {
    return { sourceId: binding.sourceId, worktreeId: binding.worktreeId };
  }
  return sourceId === undefined ? {} : { sourceId };
}

export function sharedRunFields(input: {
  runDirectory: string | null | undefined;
  worktreeBinding: WorktreeBinding | null;
  sourceId: string | undefined;
  isolation: RunIsolation | undefined;
}): SharedRunFields {
  return {
    ...(input.runDirectory ? { directory: input.runDirectory } : {}),
    ...workspaceRefs(input.worktreeBinding, input.sourceId),
    ...(input.isolation ? { isolation: input.isolation } : {}),
  };
}

export async function dispatchLocalRun(input: {
  executor: LocalExecutorPort;
  request: SendThreadRunRequest;
  thread: ThreadRecord;
  decision: Exclude<PlacementResult, { kind: 'unavailable' }>;
  runText: string | undefined;
  attachments: Attachment[];
  skills: string[];
  worktreeBinding: WorktreeBinding | null;
  sharedFields: SharedRunFields;
}): Promise<AcceptedRunResponse> {
  const { executor, request, thread, decision, runText, attachments, skills, sharedFields } = input;
  const placementExtras = input.worktreeBinding
    ? {
        worktreeId: input.worktreeBinding.worktreeId,
        worktreeHostId: input.worktreeBinding.hostId,
      }
    : undefined;
  const accepted = await executor.send({
    orgId: request.orgId,
    threadId: thread.id,
    attribution: attributedRun(request.attribution, decision.nodeId),
    text: runText,
    effort: request.body.effort,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    clientEventId: request.body.clientEventId,
    origin: request.body.origin,
    correlationId: request.body.correlationId,
    ...sharedFields,
    ...(request.trigger ? { triggerKind: request.trigger.kind } : {}),
    ...(request.branch ? { branch: request.branch } : {}),
  });
  const events = await executor.events(request.orgId);
  events.appendForThread(thread.id, accepted.runId, [toPlacementEvent(decision, placementExtras)]);
  return accepted;
}

export async function dispatchRemoteRun(input: {
  issueRemote: IssueRemoteRunUseCase;
  request: SendThreadRunRequest;
  thread: ThreadRecord;
  agent: AgentRecord;
  decision: Exclude<PlacementResult, { kind: 'unavailable' }>;
  runText: string | undefined;
  attachments: Attachment[];
  skills: string[];
  attachmentMetas: AttachmentMeta[];
  sharedFields: SharedRunFields;
}): Promise<AcceptedRunResponse> {
  const { issueRemote, request, thread, agent, decision, runText, attachments, skills } = input;
  return await issueRemote.execute({
    orgId: request.orgId,
    threadId: thread.id,
    agent,
    nodeId: decision.nodeId,
    attribution: attributedRun(request.attribution, decision.nodeId),
    runId: decision.request.runId,
    placement: decision,
    text: runText,
    effort: request.body.effort,
    mode: request.body.mode,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(input.attachmentMetas.length > 0 ? { attachmentMetas: input.attachmentMetas } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    clientEventId: request.body.clientEventId,
    origin: request.body.origin,
    correlationId: request.body.correlationId,
    ...input.sharedFields,
  });
}
