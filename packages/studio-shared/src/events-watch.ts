import type { DeskEvent } from './desk-events.ts';
import type { KnowledgeIndexState } from './knowledge.ts';
import type { ApprovalKind, ApprovalOption, ApprovalStatus, OrgId } from './org-types.ts';

export interface EventsWatchDeskFrame {
  orgId: OrgId;
  event: DeskEvent;
}
export interface SourceWatchEvent {
  kind: 'fs' | 'git';
  changedPath?: string;
}
export interface EventsWatchSourceChangeFrame {
  orgId: OrgId;
  sourceId: string;
  event: SourceWatchEvent;
}
export interface EventsWatchIndexStateFrame {
  sourceId: string;
  state: KnowledgeIndexState;
}
export interface EventsWatchSkillsFrame {
  orgId: OrgId;
  kind: 'changed';
  name?: string;
}

export interface EventsWatchFleetFrame {
  orgId: OrgId;
  type: 'fleet-changed';
}

export interface EventsWatchReleaseFrame {
  orgId: OrgId;
  type: 'release-available';
  currentVersion: string;
  latestVersion: string;
}

export interface EventsWatchMaterializationFrame {
  orgId: OrgId;
  type: 'materialization-changed';
  sourceId: string;
  hostId: string;
}

export interface EventsWatchApprovalContext {
  source: string;
  ops?: string[];
  tool?: { name: string; inputPreview?: string };
  note?: string;
  override?: { ops: string[] };
  file?: {
    host: string;
    canonicalPath: string;
    requestedPath: string;
    action: 'read' | 'edit';
    runtime: 'host' | 'container';
  };
}

export interface EventsWatchApprovalRecord {
  id: string;
  runId: string;
  agentId: string;
  threadId: string | null;
  interruptId: string;
  kind: ApprovalKind;
  question: string;
  options: ApprovalOption[];
  context: EventsWatchApprovalContext;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionSeq: number;
  createdAt: string;
}

export interface EventsWatchApprovalFrame {
  orgId: OrgId;
  type: 'requested' | 'decided' | 'cancelled';
  approval: EventsWatchApprovalRecord;
}

export type EventsWatchThreadErrorEvent =
  | { type: 'failed'; threadId: string; runId: string; message: string; at: string }
  | { type: 'cleared'; threadId: string; runId: string }
  | { type: 'parked'; threadId: string; runId: string; source: string }
  | { type: 'finished'; threadId: string; runId: string; status: 'completed' | 'cancelled' };

export interface EventsWatchThreadErrorFrame {
  orgId: OrgId;
  event: EventsWatchThreadErrorEvent;
}
