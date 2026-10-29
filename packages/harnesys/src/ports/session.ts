import type { Attachment, SendFile } from '../domain/attachment.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RunAttribution, RunRecord } from './run-lifecycle-store.ts';
import type { SessionEvent } from './session-events.ts';
export type SendInput =
  | string
  | {
      text?: string;
      effort?: string;
      images?: SendFile[];
      audio?: SendFile[];
      video?: SendFile[];
      files?: SendFile[];
      attachments?: Attachment[];
      origin?: string;
      attribution?: RunAttribution;
    };
export type { AskBudget } from '../domain/tool-subject.ts';
export type { RequestPlan, RequestSection } from './llm-plan.ts';
export type { ModelUsage, SessionEvent, SessionEventType } from './session-events.ts';

export interface SendOpts {
  signal?: AbortSignal;
  permissions?: PermissionMap;
  paths?: PathsConfig;
}
export interface SessionHandle {
  send(
    input: SendInput,
    opts?: SendOpts & {
      clientEventId?: string;
      correlationId?: string;
    },
  ): Promise<{
    runId: string;
  }>;
  respond(
    runId: string,
    askId: string,
    payload: unknown,
    opts?: {
      clientEventId?: string;
    },
  ): Promise<void>;
  reject(
    runId: string,
    askId: string,
    opts?: {
      note?: string;
      clientEventId?: string;
    },
  ): Promise<void>;
  cancel(runId: string): Promise<void>;
  subscribe(runId: string, fromSeq?: number): AsyncIterable<SessionEvent>;
  runOf(runId: string): Promise<RunRecord | null>;
  activeRun(threadId: string): Promise<RunRecord | null>;
}
