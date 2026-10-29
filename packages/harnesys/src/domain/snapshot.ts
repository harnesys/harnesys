import type { BudgetExtension, BudgetLimitKind } from './agent-definition.ts';
import type { JsonSchema } from './json-schema.ts';
export const RUNTIME_VERSION = '0.3.0';
export type CommitKind = 'intent' | 'recorded';
export type CursorPhase = 'scheduled' | 'intent' | 'executing' | 'recorded' | 'unknown' | 'failed';
export interface Cursor {
  nodes: Record<
    string,
    {
      phase: CursorPhase;
      nodeExecutionId: string;
      attempt?: number;
    }
  >;
  pending?: unknown;
  interrupt?: {
    interruptId: string;
    reason: string;
    resumeSchema: JsonSchema;
    nodeId: string;
    source?: string;
    tool?: {
      name: string;
      input: unknown;
      toolCallId: string;
    };
    output?: unknown;
    waitMode?: 'sleep' | 'gate';
    onTimeout?: 'fail' | 'continue' | 'interrupt';
    budgetKind?: BudgetLimitKind;
    budgetLimit?: number;
    budgetUsed?: number;
    budgetExtendDefault?: number;
    delegated?: {
      agentId?: string;
      agentType?: string;
      spawnId?: string;
      spawnPath?: string;
      childInterruptId?: string;
      childNodeId?: string;
    };
  };
  cancellation?: unknown;
  budget?: {
    steps: number;
    tokens: number;
    startedAt: number;
    stops?: number;
    memoryWrites?: number;
    nudges?: number;
    extend?: BudgetExtension;
    deadlineAt?: number;
  };
  barriers?: Record<string, unknown>;
  timers?: {
    id: string;
    fireAt: number;
  }[];
}
export interface Snapshot {
  sessionId: string;
  runId: string;
  definitionHash: string;
  planHash: string;
  sequence: number;
  status: string;
  runtimeVersion: string;
  initialInput: unknown;
  state: Record<string, unknown>;
  cursor: Cursor;
}
export interface Event {
  eventId: string;
  type: string;
  timestamp: number;
  sessionId: string;
  runId: string;
  agentId: string;
  sequence: number;
  causationId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}
