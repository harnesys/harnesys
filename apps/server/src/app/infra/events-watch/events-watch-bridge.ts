import { Injectable, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import type {
  DeskEvent,
  EventsWatchApprovalFrame,
  EventsWatchApprovalRecord,
  EventsWatchConnectorFrame,
  EventsWatchDeskFrame,
  EventsWatchFleetFrame,
  EventsWatchGitFileStatusFrame,
  EventsWatchGitSummaryFrame,
  EventsWatchIndexStateFrame,
  EventsWatchMaterializationFrame,
  EventsWatchReleaseFrame,
  EventsWatchSkillsFrame,
  EventsWatchSourceChangeFrame,
  EventsWatchTerminalFrame,
  EventsWatchThreadErrorFrame,
  EventsWatchThreadEventsFrame,
  KnowledgeIndexState,
  TerminalWatchEvent,
} from '@harnesys/studio-shared';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';
import type { ApprovalEvent } from '../../domain/approval/approval-events.port.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ConnectorEventsPort } from '../../domain/connector/connector-events.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import type { IssueDomainEvent } from '../../domain/issue/issue-events.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { KnowledgeIndexEventsPort } from '../../domain/knowledge/knowledge-index-events.port.ts';
import type { PlanEvent } from '../../domain/plan/plan-events.port.ts';
import { PlanEventsPort } from '../../domain/plan/plan-events.port.ts';
import { ReleaseEventsPort } from '../../domain/release/release-events.port.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { GitWatchEventsPort } from '../../domain/source/git-watch-events.port.ts';
import type { MaterializationChangedEvent } from '../../domain/source/materialization-events.port.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { TerminalEventsPort } from '../../domain/terminal/terminal-events.port.ts';
import type { ThreadRunEvent } from '../../domain/thread/thread-events.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';

@Injectable()
export class EventsWatchBridge implements ModuleInitHook, ModuleDestroyHook {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly hub: EventsWatchHubPort,
    private readonly sources: SourceRegistryPort,
    private readonly indexEvents: KnowledgeIndexEventsPort,
    private readonly approvalEvents: ApprovalEventsPort,
    private readonly planEvents: PlanEventsPort,
    private readonly issueEvents: IssueEventsPort,
    private readonly deskEvents: DeskEventsPort,
    private readonly sourceWatchEvents: SourceWatchEventsPort,
    private readonly gitWatchEvents: GitWatchEventsPort,
    private readonly skillsEvents: SkillsEventsPort,
    private readonly threadEvents: ThreadEventsPort,
    private readonly fleetEvents: FleetEventsPort,
    private readonly materializationEvents: MaterializationEventsPort,
    private readonly releaseEvents: ReleaseEventsPort,
    private readonly terminalEvents: TerminalEventsPort,
    private readonly connectorEvents: ConnectorEventsPort,
  ) {}

  onModuleInit(): void {
    this.unsubscribers = [
      this.indexEvents.subscribeAll((sourceId, state) => this.publishIndexState(sourceId, state)),
      this.approvalEvents.subscribe((orgId, event) => this.publishApproval(orgId, event)),
      this.planEvents.subscribe((orgId, event) => this.publishPlan(orgId, event)),
      this.issueEvents.subscribe((orgId, event) => this.publishIssue(orgId, event)),
      this.deskEvents.subscribe((orgId, event) => this.publishDesk(orgId, event)),
      this.sourceWatchEvents.subscribe((frame) => this.publishSourceChange(frame)),
      this.gitWatchEvents.subscribe((frame) => this.publishGitSummary(frame)),
      this.gitWatchEvents.subscribeFileStatus((frame) => this.publishGitFileStatus(frame)),
      this.skillsEvents.subscribe((frame) => this.publishSkills(frame)),
      this.threadEvents.subscribe((orgId, event) => this.publishThreadEvent(orgId, event)),
      this.fleetEvents.subscribe((orgId) => this.publishFleet(orgId)),
      this.materializationEvents.subscribe((event) => this.publishMaterialization(event)),
      this.releaseEvents.subscribe((frame) => this.publishRelease(frame)),
      this.terminalEvents.subscribe((orgId, event) => this.publishTerminal(orgId, event)),
      this.connectorEvents.subscribe((orgId) => this.publishConnectors(orgId)),
    ];
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  private publishIndexState(sourceId: string, state: KnowledgeIndexState): void {
    const source = this.sources.findBySourceId(sourceId);
    if (!source) {
      return;
    }
    const frame: EventsWatchIndexStateFrame = { orgId: source.orgId, sourceId, state };
    this.hub.publish(source.orgId, 'index-state', frame);
  }

  private publishApproval(orgId: string, event: ApprovalEvent): void {
    const frame: EventsWatchApprovalFrame = {
      orgId,
      type: event.type,
      approval: toWatchApproval(event.approval),
    };
    this.hub.publish(orgId, 'approval', frame);
  }

  private publishPlan(orgId: string, event: PlanEvent): void {
    const deskEvent: DeskEvent =
      event.type === 'saved'
        ? { type: 'plan', plan: event.plan }
        : { type: 'plan-deleted', threadId: event.threadId };
    this.publishDesk(orgId, deskEvent);
  }

  private publishIssue(orgId: string, event: IssueDomainEvent): void {
    this.publishDesk(orgId, toDeskIssueEvent(event));
  }

  private publishDesk(orgId: string, event: DeskEvent): void {
    const frame: EventsWatchDeskFrame = { orgId, event };
    this.hub.publish(orgId, 'desk', frame);
  }

  private publishSourceChange(frame: EventsWatchSourceChangeFrame): void {
    this.hub.publish(frame.orgId, 'source-change', frame);
  }

  private publishGitSummary(frame: EventsWatchGitSummaryFrame): void {
    this.hub.publish(frame.orgId, 'git-summary', frame);
  }

  private publishGitFileStatus(frame: EventsWatchGitFileStatusFrame): void {
    this.hub.publish(frame.orgId, 'git-file-status', frame);
  }

  private publishSkills(frame: EventsWatchSkillsFrame): void {
    this.hub.publish(frame.orgId, 'skills-changed', frame);
  }

  private publishThreadEvent(orgId: string, event: ThreadRunEvent): void {
    if (event.type === 'events') {
      const frame: EventsWatchThreadEventsFrame = {
        orgId,
        threadId: event.threadId,
        events: event.events,
      };
      this.hub.publish(orgId, 'thread-events', frame);
      return;
    }
    const frame: EventsWatchThreadErrorFrame = { orgId, event };
    this.hub.publish(orgId, 'thread-error', frame);
  }

  private publishFleet(orgId: string): void {
    const frame: EventsWatchFleetFrame = { orgId, type: 'fleet-changed' };
    this.hub.publish(orgId, 'fleet-changed', frame);
  }

  private publishMaterialization(event: MaterializationChangedEvent): void {
    const frame: EventsWatchMaterializationFrame = {
      orgId: event.orgId,
      type: 'materialization-changed',
      sourceId: event.sourceId,
      hostId: event.hostId,
    };
    this.hub.publish(event.orgId, 'materialization-changed', frame);
  }

  private publishRelease(frame: EventsWatchReleaseFrame): void {
    this.hub.publish(frame.orgId, 'release-available', frame);
  }

  private publishTerminal(orgId: string, event: TerminalWatchEvent): void {
    const frame: EventsWatchTerminalFrame = { orgId, event };
    this.hub.publish(orgId, 'terminal', frame);
  }

  private publishConnectors(orgId: string): void {
    const frame: EventsWatchConnectorFrame = { orgId, type: 'connectors-changed' };
    this.hub.publish(orgId, 'connectors-changed', frame);
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
