import { Injectable, Logger } from '@harnesys/brix';
import { issueTaskText } from '@harnesys/studio-shared';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import { appendFireTrail } from '../../domain/issue/issue.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { IssueFireRequest, IssueFireResult } from '../../domain/issue/issue-fire.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { RunConflictException } from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { mechanicalRunStart } from '../threads/run-attribution.ts';
import { SendThreadRunUseCase } from '../threads/send-thread-run.use-case.ts';

function workspaceRefs(request: IssueFireRequest): { sourceId?: string; worktreeId?: string } {
  if (request.sourceId === undefined) {
    return {};
  }
  return request.worktreeId === undefined
    ? { sourceId: request.sourceId }
    : { sourceId: request.sourceId, worktreeId: request.worktreeId };
}

@Injectable()
export class FireIssueUseCase {
  private readonly log: Logger;

  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly events: IssueEventsPort,
    private readonly threadEvents: ThreadEventsPort,
    private readonly sendThreadRun: SendThreadRunUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('fire-issue');
  }

  async execute(request: IssueFireRequest): Promise<IssueFireResult> {
    const issue = this.issues.findById(request.orgId, request.issueId);
    if (!issue) {
      return { outcome: 'failed', error: `issue not found: ${request.issueId}` };
    }
    try {
      const board = this.boards.findById(request.orgId, issue.boardId);
      const thread = this.ensureThread(request.orgId, issue.id, request.agentId, issue.title);
      const sourceRefs = this.sourceRefs(request.orgId, issue.id);
      const accepted = await this.sendThreadRun.execute({
        orgId: request.orgId,
        threadId: thread.id,
        body: {
          text: issueTaskText({
            issueId: issue.id,
            title: issue.title,
            description: this.descriptionWithSources(issue.description, sourceRefs),
            status: issue.statusKey,
            priority: issue.priority,
            type: issue.type,
            labels: this.labelTitles(request.orgId, issue.labels),
            ...(board ? { board: board.name } : {}),
            reason: request.reason,
          }),
          correlationId: request.correlationId ?? this.correlationId(request, issue.statusKey),
          ...workspaceRefs(request),
        },
        issueRuleProfileId: request.issueRuleProfileId ?? null,
        priority: issue.priority,
        attribution: mechanicalRunStart(request.ownerUserId ?? null),
        trigger: { kind: 'issue', id: issue.id },
        ...(request.branch ? { branch: request.branch } : {}),
      });
      this.threads.touch(request.orgId, thread.id);
      this.clearThreadLaunchError(request.orgId, thread.id, accepted.runId);
      this.recordTrail(request.orgId, issue, request, 'fired');
      if (request.matchedLabelId) {
        this.log.info(
          {
            orgId: request.orgId,
            issueId: issue.id,
            agentId: request.agentId,
            matchedLabelId: request.matchedLabelId,
          },
          'issue fire matched rule label',
        );
      }
      return { outcome: 'fired', runId: accepted.runId };
    } catch (error) {
      if (error instanceof RunConflictException) {
        this.log.info(
          { orgId: request.orgId, issueId: issue.id, agentId: request.agentId },
          'issue thread busy, run skipped',
        );
        this.recordTrail(request.orgId, issue, request, 'thread-busy');
        return { outcome: 'thread-busy' };
      }
      this.log.warn(
        {
          orgId: request.orgId,
          issueId: issue.id,
          agentId: request.agentId,
          err: error instanceof Error ? error.message : String(error),
        },
        'issue fire failed',
      );
      const message = error instanceof Error ? error.message : String(error);
      this.recordThreadLaunchError(request.orgId, issue.id, request.agentId, message);
      this.recordTrail(request.orgId, issue, request, 'failed', message);
      return { outcome: 'failed', error: message };
    }
  }

  private sourceRefs(
    orgId: string,
    issueId: string,
  ): Array<{ sourceId: string; relativePath: string }> {
    const refs: Array<{ sourceId: string; relativePath: string }> = [];
    for (const row of this.attachments.listByIssue(orgId, issueId)) {
      if (row.kind !== 'source' || !row.sourceId || !row.sourcePath) {
        continue;
      }
      refs.push({ sourceId: row.sourceId, relativePath: row.sourcePath });
    }
    return refs;
  }

  private descriptionWithSources(
    description: string,
    refs: Array<{ sourceId: string; relativePath: string }>,
  ): string {
    if (refs.length === 0) {
      return description;
    }
    const lines = refs.map((ref) => `- source:${ref.sourceId}:${ref.relativePath}`);
    const block = `Source attachments:\n${lines.join('\n')}`;
    return description.trim() ? `${description.trim()}\n\n${block}` : block;
  }

  private recordTrail(
    orgId: string,
    issue: IssueRecord,
    request: IssueFireRequest,
    outcome: 'fired' | 'thread-busy' | 'failed',
    error?: string,
  ): void {
    const updated = this.issues.update(orgId, issue.id, {
      fireTrail: appendFireTrail(this.issues.findById(orgId, issue.id)?.fireTrail ?? [], {
        agentId: request.agentId,
        statusKey: issue.statusKey,
        reason: request.reason,
        outcome,
        ...(error ? { error } : {}),
        at: new Date().toISOString(),
      }),
      updatedAt: new Date().toISOString(),
    });
    this.events.emit(orgId, { type: 'issue', issue: updated });
  }

  private recordThreadLaunchError(
    orgId: string,
    issueId: string,
    agentId: string,
    message: string,
  ): void {
    const thread = this.threads.findByIssueAndAgent(orgId, issueId, agentId);
    if (!thread) {
      return;
    }
    const at = new Date().toISOString();
    const runId = `launch:${issueId}:${at}`;
    this.threads.patch(orgId, thread.id, {
      metadata: { ...thread.metadata, lastError: { runId, message, at } },
    });
    this.threads.touch(orgId, thread.id);
    this.threadEvents.emit(orgId, { type: 'failed', threadId: thread.id, runId, message, at });
  }

  private clearThreadLaunchError(orgId: string, threadId: string, runId: string): void {
    const thread = this.threads.findById(orgId, threadId);
    if (!thread || thread.metadata.lastError === undefined) {
      return;
    }
    const { lastError: _dropped, ...metadata } = thread.metadata;
    this.threads.patch(orgId, threadId, { metadata });
    this.threadEvents.emit(orgId, { type: 'cleared', threadId, runId });
  }

  private correlationId(request: IssueFireRequest, status: string): string {
    return `issue:${request.issueId}:${status}:${request.agentId}`;
  }

  private labelTitles(orgId: string, labelIds: string[]): string[] {
    return labelIds.map((labelId) => this.labels.findById(orgId, labelId)?.title ?? labelId);
  }

  private ensureThread(orgId: string, issueId: string, agentId: string, title: string) {
    const existing = this.threads.findByIssueAndAgent(orgId, issueId, agentId);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    return this.threads.insert({
      id: crypto.randomUUID(),
      orgId,
      agentId,
      originAgentId: agentId,
      title: `Issue: ${title}`.slice(0, 80),
      kind: 'issue',
      parentThreadId: null,
      forkAt: null,
      inheritedEventCount: 0,
      metadata: {},
      issueId,
      runProfileId: null,
      runDirectory: null,
      createdAt: now,
      updatedAt: now,
      lastReadAt: now,
    });
  }
}
