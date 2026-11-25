import type {
  RunAcceptedResponse,
  RunEnvironment,
  SendThreadRunBody,
  WorkspaceRef,
} from '@harnesys/contracts';
import type { Attachment } from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { PlacementResult, RunIsolation } from '../../domain/fleet/placement.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { IssueRemoteRunUseCase } from '../fleet/issue-remote-run.use-case.ts';
import { IssueWaitingRunUseCase } from '../fleet/issue-waiting-run.use-case.ts';
import { toPlacementEvent } from './resolve-run-placement.ts';
import { attributedRun } from './run-attribution.ts';
import { type AttachmentMeta, attachmentMetasOf } from './send-thread-attachments.ts';
import type { SendThreadRunRequest } from './send-thread-run.use-case.ts';

export interface SharedRunFields {
  environment?: RunEnvironment;
  isolation?: RunIsolation;
}

export function sharedRunFields(input: {
  environment: RunEnvironment;
  isolation: RunIsolation | undefined;
}): SharedRunFields {
  return {
    environment: input.environment,
    ...(input.isolation ? { isolation: input.isolation } : {}),
  };
}

export function explicitWorkspaceRef(body: SendThreadRunBody): WorkspaceRef | undefined {
  if (body.workspaceRef !== undefined) {
    return body.workspaceRef;
  }
  if (body.sourceId === undefined) {
    return undefined;
  }
  return body.worktreeId !== undefined
    ? { kind: 'worktree', sourceId: body.sourceId, worktreeId: body.worktreeId }
    : { kind: 'source', sourceId: body.sourceId };
}

export function legacyRunFieldsOf(environment: RunEnvironment): {
  sourceId?: string;
  worktreeId?: string;
} {
  const anchor = environment.anchor;
  if (anchor === null || anchor.kind !== 'source') {
    return {};
  }
  return {
    sourceId: anchor.sourceId,
    ...(anchor.worktreeId !== undefined ? { worktreeId: anchor.worktreeId } : {}),
  };
}

export interface RunDispatchDeps {
  attachments: AttachmentRepositoryPort;
  executor: LocalExecutorPort;
  issueRemote: IssueRemoteRunUseCase;
  issueWaiting: IssueWaitingRunUseCase;
  machineConfig: MachineConfigPort;
}

export interface RunDispatchInput {
  request: SendThreadRunRequest;
  thread: ThreadRecord;
  agent: AgentRecord;
  decision: PlacementResult;
  attachments: Attachment[];
  requestedSkills: string[];
  runText: string | undefined;
  environment: RunEnvironment;
}

export async function dispatchPlacedRun(
  deps: RunDispatchDeps,
  input: RunDispatchInput,
): Promise<RunAcceptedResponse> {
  const { request, thread, agent, decision, attachments, requestedSkills, environment } = input;
  const attachmentMetas = attachmentMetasOf(
    deps.attachments,
    request.orgId,
    request.threadId,
    request.body.attachmentIds,
  );
  if (decision.kind === 'unavailable') {
    return await issueUnavailable(deps, {
      ...input,
      decision,
      agentId: agent.id,
      agentName: agent.name,
      text: input.runText,
      attachmentMetas,
    });
  }
  const sharedFields = sharedRunFields({
    environment,
    isolation: decision.request.isolation,
  });
  const localHostId = deps.machineConfig.get().id;
  if (decision.nodeId === localHostId) {
    return await dispatchLocalRun({
      executor: deps.executor,
      request,
      thread,
      agent,
      decision,
      runText: input.runText,
      attachments,
      skills: requestedSkills,
      sharedFields,
    });
  }
  return await dispatchRemoteRun({
    issueRemote: deps.issueRemote,
    request,
    thread,
    agent,
    decision,
    runText: input.runText,
    attachments,
    skills: requestedSkills,
    attachmentMetas,
    sharedFields,
  });
}

async function issueUnavailable(
  deps: RunDispatchDeps,
  input: RunDispatchInput & {
    decision: Extract<PlacementResult, { kind: 'unavailable' }>;
    agentId: string;
    agentName: string;
    text: string | undefined;
    attachmentMetas: AttachmentMeta[];
  },
): Promise<RunAcceptedResponse> {
  const decision = input.decision;
  const trigger = input.request.trigger ?? {
    kind: 'chat' as const,
    id: input.request.threadId,
  };
  return await deps.issueWaiting.execute({
    orgId: input.request.orgId,
    threadId: input.thread.id,
    runId: decision.request.runId,
    profileId: decision.request.profileId,
    agentId: input.agentId,
    agentName: input.agentName,
    priority: input.request.priority ?? 3,
    trigger,
    reason: decision.reason,
    attribution: attributedRun(input.request.attribution, null),
    candidatesJson: JSON.stringify(decision.candidates),
    configRevision: 0,
    placementEvent: toPlacementEvent(decision),
    text: input.text,
    ...(input.request.body.quote ? { quote: input.request.body.quote } : {}),
    effort: input.request.body.effort,
    mode: input.request.body.mode,
    ...(input.requestedSkills.length > 0 ? { skills: input.requestedSkills } : {}),
    ...(input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    ...(input.attachmentMetas.length > 0 ? { attachmentMetas: input.attachmentMetas } : {}),
    clientEventId: input.request.body.clientEventId,
    origin: input.request.body.origin,
    correlationId: input.request.body.correlationId,
    expiresAt: input.request.expiresAt ?? null,
    ...legacyRunFieldsOf(input.environment),
    environment: input.environment,
    issueRuleProfileId: input.request.issueRuleProfileId,
    profileSource: decision.request.profileSource,
  });
}

export async function dispatchLocalRun(input: {
  executor: LocalExecutorPort;
  request: SendThreadRunRequest;
  thread: ThreadRecord;
  agent: AgentRecord;
  decision: Exclude<PlacementResult, { kind: 'unavailable' }>;
  runText: string | undefined;
  attachments: Attachment[];
  skills: string[];
  sharedFields: SharedRunFields;
}): Promise<RunAcceptedResponse> {
  const { executor, request, thread, agent, decision, runText, attachments, skills, sharedFields } =
    input;
  const accepted = await executor.send({
    orgId: request.orgId,
    threadId: thread.id,
    agentId: agent.id,
    attribution: attributedRun(request.attribution, decision.nodeId),
    text: runText,
    effort: request.body.effort,
    ...(request.body.mode ? { mode: request.body.mode } : {}),
    ...(request.body.quote ? { quote: request.body.quote } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    clientEventId: request.body.clientEventId,
    origin: request.body.origin,
    correlationId: request.body.correlationId,
    ...sharedFields,
    ...(request.branch ? { branch: request.branch } : {}),
  });
  const events = await executor.events(request.orgId);
  await events.appendForThread(thread.id, accepted.runId, [toPlacementEvent(decision)]);
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
}): Promise<RunAcceptedResponse> {
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
    ...(request.body.quote ? { quote: request.body.quote } : {}),
    effort: request.body.effort,
    mode: request.body.mode,
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(input.attachmentMetas.length > 0 ? { attachmentMetas: input.attachmentMetas } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    clientEventId: request.body.clientEventId,
    origin: request.body.origin,
    correlationId: request.body.correlationId,
    ...input.sharedFields,
    ...(request.trigger !== undefined ? { trigger: request.trigger } : {}),
    expiresAt: request.expiresAt ?? null,
  });
}
