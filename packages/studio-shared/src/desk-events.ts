import type { AgentPublic } from '@harnesys/contracts';
import type { IssueBoardRecord, IssueLabelRecord, IssueRecord } from './issue.ts';
import type { ThreadPlanRecord } from './plan-types.ts';
import type { ScheduleRecord, WebhookRecord } from './schedule.ts';
import type { ThreadRecord } from './thread.ts';

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';
export interface ThreadAttachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  path: string;
}
export interface HumanEntry {
  id: string;
  text?: string;
  createdAt: string;
  attachments?: ThreadAttachment[];
  origin?: string;
}
export type DeskEvent =
  | {
      type: 'thread';
      thread: ThreadRecord;
    }
  | {
      type: 'schedule';
      schedule: ScheduleRecord;
    }
  | {
      type: 'schedule-deleted';
      id: string;
    }
  | {
      type: 'plan';
      plan: ThreadPlanRecord;
    }
  | {
      type: 'plan-deleted';
      threadId: string;
    }
  | {
      type: 'webhook';
      webhook: WebhookRecord;
    }
  | {
      type: 'webhook-deleted';
      id: string;
    }
  | {
      type: 'agent';
      agent: AgentPublic;
    }
  | {
      type: 'agent-deleted';
      id: string;
    }
  | {
      type: 'issue';
      issue: IssueRecord;
    }
  | {
      type: 'issue-deleted';
      issueId: string;
      boardId: string;
    }
  | {
      type: 'issue-board';
      board: IssueBoardRecord;
    }
  | {
      type: 'issue-board-deleted';
      boardId: string;
    }
  | {
      type: 'issue-rule-notification';
      boardId: string;
      issueId: string;
      text: string;
    }
  | {
      type: 'issue-label';
      label: IssueLabelRecord;
    }
  | {
      type: 'issue-label-deleted';
      labelId: string;
    }
  | {
      type: 'terminal';
      projectId: string;
      jobId: string;
    }
  | {
      type: 'run-finish';
      threadId: string;
    };
