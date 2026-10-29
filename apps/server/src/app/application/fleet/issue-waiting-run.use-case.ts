import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { AcceptedRunResponse, TaskEnvelopeAttachment } from '@harnesys/contracts';
import type { Attachment, RunAttribution } from 'harnesys';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { toPlacementEvent } from '../threads/resolve-run-placement.ts';

export interface IssueWaitingRunInput {
  orgId: string;
  threadId: string;
  runId: string;
  profileId: string;
  agentId: string;
  priority: number;
  trigger: { kind: 'chat' | 'issue' | 'schedule' | 'webhook' | 'connector'; id: string };
  reason: string;
  attribution: RunAttribution;
  candidatesJson: string;
  configRevision: number;
  placementEvent: ReturnType<typeof toPlacementEvent>;
  text?: string;
  effort?: string;
  mode?: string;
  skills?: string[];
  attachments?: Attachment[];
  attachmentMetas?: TaskEnvelopeAttachment[];
  clientEventId?: string;
  origin?: string;
  correlationId?: string;
  expiresAt?: string | null;
  sourceId?: string;
  worktreeId?: string;
  worktreeHostId?: string;
  issueRuleProfileId?: string | null;
  profileSource?: 'thread' | 'issue-rule' | 'agent' | 'organization';
}

@Injectable()
export class IssueWaitingRunUseCase {
  constructor(
    private readonly executor: LocalExecutorPort,
    private readonly pending: PendingPlacementPort,
    private readonly events: FleetEventsPort,
    private readonly revisions: OrgConfigRevisionPort,
  ) {}

  async execute(input: IssueWaitingRunInput): Promise<AcceptedRunResponse> {
    const lifecycle = await this.executor.lifecycle(input.orgId);
    const clientEventId = input.clientEventId ?? randomUUID();
    const attachmentMetas = input.attachmentMetas ?? toEnvelopeAttachments(input.attachments ?? []);
    const created = await lifecycle.create(
      { runId: input.runId, threadId: input.threadId, attribution: input.attribution },
      [waitingUserEvent(input, clientEventId), input.placementEvent],
    );
    await lifecycle.transition(created.runId, created.leaseEpoch, {
      from: 'queued',
      to: 'waiting',
      events: [
        {
          type: 'wait.started',
          askId: randomUUID(),
          mode: 'gate',
          source: 'wait',
          prompt: `waiting for profile ${input.profileId}`,
        },
      ],
    });
    const createdAt = new Date().toISOString();
    const configRevision = input.configRevision || this.revisions.get(input.orgId).revision;
    this.pending.upsert({
      runId: created.runId,
      orgId: input.orgId,
      threadId: input.threadId,
      profileId: input.profileId,
      configRevision,
      createdAt,
      lastReason: input.reason,
      attempt: 0,
      priority: input.priority,
      trigger: input.trigger,
      expiresAt: input.expiresAt ?? null,
      payload: waitingPayload(input, clientEventId, attachmentMetas),
      lastCandidatesJson: input.candidatesJson,
    });
    this.events.emit(input.orgId);
    return {
      runId: created.runId,
      threadId: input.threadId,
      status: 'waiting',
      waitingForProfileId: input.profileId,
    };
  }
}

export function toEnvelopeAttachments(attachments: Attachment[]): TaskEnvelopeAttachment[] {
  return attachments.map((item) => ({
    id: item.id,
    name: item.name,
    mediaType: item.mediaType,
    kind: item.kind,
    sizeBytes: 0,
  }));
}

function waitingUserEvent(input: IssueWaitingRunInput, clientEventId: string) {
  return {
    type: 'user' as const,
    text: input.text ?? '',
    clientEventId,
    ...(input.origin ? { origin: input.origin } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  };
}

function waitingPayload(
  input: IssueWaitingRunInput,
  clientEventId: string,
  attachmentMetas: TaskEnvelopeAttachment[],
) {
  return {
    agentId: input.agentId,
    text: input.text ?? '',
    attribution: input.attribution,
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.skills?.length ? { skills: input.skills } : {}),
    ...(attachmentMetas.length > 0 ? { attachmentMetas } : {}),
    clientEventId,
    ...(input.origin ? { origin: input.origin } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
    ...(input.worktreeHostId ? { worktreeHostId: input.worktreeHostId } : {}),
    ...(input.issueRuleProfileId ? { issueRuleProfileId: input.issueRuleProfileId } : {}),
    ...(input.profileSource ? { profileSource: input.profileSource } : {}),
  };
}
