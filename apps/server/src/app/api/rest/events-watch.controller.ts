import { Controller, Get } from '@harnesys/brix';
import type {
  DeskEvent,
  EventsWatchApprovalFrame,
  EventsWatchApprovalRecord,
  EventsWatchDeskFrame,
  EventsWatchFleetFrame,
  EventsWatchIndexStateFrame,
  EventsWatchMaterializationFrame,
  EventsWatchThreadErrorFrame,
} from '@harnesys/studio-shared';
import { SSE_KEEP_ALIVE_MS } from '../../../const.ts';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import type { IssueDomainEvent } from '../../domain/issue/issue-events.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { KnowledgeIndexEventsPort } from '../../domain/knowledge/knowledge-index-events.port.ts';
import { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { SourceWatchGatePort } from '../../domain/source/source-watch-gate.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { OrgIdHeader } from '../org-id.ts';

@Controller()
export class EventsWatchController {
  constructor(
    private readonly indexEvents: KnowledgeIndexEventsPort,
    private readonly approvalEvents: ApprovalEventsPort,
    private readonly planEvents: PlanEventsPort,
    private readonly issueEvents: IssueEventsPort,
    private readonly deskEvents: DeskEventsPort,
    private readonly sourceWatchEvents: SourceWatchEventsPort,
    private readonly sourceWatchGate: SourceWatchGatePort,
    private readonly skillsEvents: SkillsEventsPort,
    private readonly threadEvents: ThreadEventsPort,
    private readonly fleetEvents: FleetEventsPort,
    private readonly materializationEvents: MaterializationEventsPort,
  ) {}

  @Get('events/watch')
  watch(@OrgIdHeader() orgId: string): Response {
    const indexEvents = this.indexEvents;
    const approvalEvents = this.approvalEvents;
    const planEvents = this.planEvents;
    const issueEvents = this.issueEvents;
    const deskEvents = this.deskEvents;
    const sourceWatchEvents = this.sourceWatchEvents;
    const sourceWatchGate = this.sourceWatchGate;
    const skillsEvents = this.skillsEvents;
    const threadEvents = this.threadEvents;
    const fleetEvents = this.fleetEvents;
    const materializationEvents = this.materializationEvents;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let unsubscribeIndex: (() => void) | undefined;
    let unsubscribeApprovals: (() => void) | undefined;
    let unsubscribePlans: (() => void) | undefined;
    let unsubscribeIssues: (() => void) | undefined;
    let unsubscribeDesk: (() => void) | undefined;
    let unsubscribeSources: (() => void) | undefined;
    let unsubscribeSkills: (() => void) | undefined;
    let unsubscribeThreadErrors: (() => void) | undefined;
    let unsubscribeFleet: (() => void) | undefined;
    let unsubscribeMaterialization: (() => void) | undefined;
    let releaseSourceWatches: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const write = (event: string, data: string) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
          } catch {
            // stream already closed
          }
        };
        unsubscribeIndex = indexEvents.subscribeAll((sourceId, state) => {
          const frame: EventsWatchIndexStateFrame = { sourceId, state };
          write('index-state', JSON.stringify(frame));
        });
        unsubscribeApprovals = approvalEvents.subscribe((orgId, event) => {
          const frame: EventsWatchApprovalFrame = {
            orgId,
            type: event.type,
            approval: toWatchApproval(event.approval),
          };
          write('approval', JSON.stringify(frame));
        });
        unsubscribePlans = planEvents.subscribe((orgId, event) => {
          const deskEvent: DeskEvent =
            event.type === 'saved'
              ? { type: 'plan', plan: event.plan }
              : { type: 'plan-deleted', threadId: event.threadId };
          const frame: EventsWatchDeskFrame = { orgId, event: deskEvent };
          write('desk', JSON.stringify(frame));
        });
        unsubscribeIssues = issueEvents.subscribe((orgId, event) => {
          const frame: EventsWatchDeskFrame = { orgId, event: toDeskIssueEvent(event) };
          write('desk', JSON.stringify(frame));
        });
        unsubscribeDesk = deskEvents.subscribe((orgId, event) => {
          const frame: EventsWatchDeskFrame = { orgId, event };
          write('desk', JSON.stringify(frame));
        });
        unsubscribeSources = sourceWatchEvents.subscribe((frame) => {
          write('source-change', JSON.stringify(frame));
        });
        unsubscribeSkills = skillsEvents.subscribe((frame) => {
          write('skills-changed', JSON.stringify(frame));
        });
        unsubscribeThreadErrors = threadEvents.subscribe((eventOrgId, event) => {
          const frame: EventsWatchThreadErrorFrame = { orgId: eventOrgId, event };
          write('thread-error', JSON.stringify(frame));
        });
        unsubscribeFleet = fleetEvents.subscribe((eventOrgId) => {
          const frame: EventsWatchFleetFrame = { orgId: eventOrgId, type: 'fleet-changed' };
          write('fleet-changed', JSON.stringify(frame));
        });
        unsubscribeMaterialization = materializationEvents.subscribe((event) => {
          const frame: EventsWatchMaterializationFrame = {
            orgId: event.orgId,
            type: 'materialization-changed',
            sourceId: event.sourceId,
            hostId: event.hostId,
          };
          write('materialization-changed', JSON.stringify(frame));
        });
        releaseSourceWatches = sourceWatchGate.acquire(orgId);
        keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(':\n\n'));
          } catch {
            // stream already closed
          }
        }, SSE_KEEP_ALIVE_MS);
      },
      cancel() {
        if (keepAlive) {
          clearInterval(keepAlive);
        }
        unsubscribeIndex?.();
        unsubscribeApprovals?.();
        unsubscribePlans?.();
        unsubscribeIssues?.();
        unsubscribeDesk?.();
        unsubscribeSources?.();
        unsubscribeSkills?.();
        unsubscribeThreadErrors?.();
        unsubscribeFleet?.();
        unsubscribeMaterialization?.();
        releaseSourceWatches?.();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }
}

function toDeskIssueEvent(event: IssueDomainEvent): DeskEvent {
  switch (event.type) {
    case 'issue': {
      const { orgId: _orgId, ...issue } = event.issue;
      return { type: 'issue', issue };
    }
    case 'issue-deleted': {
      return { type: 'issue-deleted', issueId: event.issueId, boardId: event.boardId };
    }
    case 'board': {
      const { orgId: _orgBoard, ...board } = event.board;
      return { type: 'issue-board', board };
    }
    case 'rule-notification': {
      return {
        type: 'issue-rule-notification',
        boardId: event.boardId,
        issueId: event.issueId,
        text: event.text,
      };
    }
    case 'board-deleted': {
      return { type: 'issue-board-deleted', boardId: event.boardId };
    }
    case 'label': {
      const { orgId: _orgLabel, ...label } = event.label;
      return { type: 'issue-label', label };
    }
    case 'label-deleted': {
      return { type: 'issue-label-deleted', labelId: event.labelId };
    }
  }
}

function toWatchApproval(row: ApprovalRecord): EventsWatchApprovalRecord {
  return {
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    threadId: row.threadId,
    interruptId: row.interruptId,
    kind: row.kind,
    question: row.question,
    options: row.options,
    context: {
      source: row.context.source,
      ...(row.context.ops ? { ops: row.context.ops } : {}),
      ...(row.context.tool ? { tool: row.context.tool } : {}),
      ...(row.context.note ? { note: row.context.note } : {}),
      ...(row.context.override ? { override: row.context.override } : {}),
      ...(row.context.budget ? { budget: row.context.budget } : {}),
      ...(row.context.file ? { file: row.context.file } : {}),
    },
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionSeq: row.decisionSeq,
    createdAt: row.createdAt,
  };
}
