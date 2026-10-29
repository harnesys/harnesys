import type { Attachment } from '../domain/attachment.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { AskBudget, ToolAskSubject } from '../domain/tool-subject.ts';
import type { RequestPlan } from './llm-plan.ts';
import type { ModelUsage } from './model-usage.ts';

export type { ModelUsage } from './model-usage.ts';

export type SessionEventType =
  | 'user'
  | 'text-delta'
  | 'reasoning-delta'
  | 'reasoning-start'
  | 'reasoning-end'
  | 'tool'
  | 'source'
  | 'file'
  | 'ask'
  | 'hitl.answer'
  | 'run.started'
  | 'model.usage'
  | 'model.stats'
  | 'model.retry'
  | 'compaction'
  | 'run.completed'
  | 'run.cancelled'
  | 'run.failed'
  | 'run.resumed'
  | 'done'
  | 'error'
  | 'agent.handoff'
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.failed'
  | 'map.started'
  | 'map.item.started'
  | 'map.item.completed'
  | 'map.item.failed'
  | 'map.completed'
  | 'wait.started'
  | 'wait.resumed'
  | 'placement.decided'
  | 'hook'
  | 'memory';

export type SessionEvent =
  | {
      type: 'user';
      text: string;
      attachments?: Attachment[];
      origin?: string;
      effort?: string;
      clientEventId?: string;
      correlationId?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'text-delta';
      text: string;
      id?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'reasoning-delta';
      text: string;
      id?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'reasoning-start';
      id: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'reasoning-end';
      id: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'tool';
      phase: 'streaming' | 'requested' | 'completed' | 'failed' | 'skipped';
      toolCallId: string;
      name: string;
      input?: unknown;
      output?: unknown;
      message?: string;
      delta?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'source';
      source: unknown;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'file';
      file: unknown;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'ask';
      askId: string;
      schema: JsonSchema;
      source: 'permission' | 'approve' | 'interrupt' | 'ask_user' | 'budget';
      prompt?: string;
      budget?: AskBudget;
      tool?: { name: string; input: unknown; toolCallId: string; subject?: ToolAskSubject };
      delegated?: { agentId?: string; agentType?: string; spawnPath?: string };
      seq?: number;
      runId?: string;
    }
  | {
      type: 'hitl.answer';
      interruptId: string;
      payload?: unknown;
      rejected?: boolean;
      note?: string;
      clientEventId?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'run.started';
      attempt: number;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'model.usage';
      usage: ModelUsage;
      agentId?: string;
      costUsd?: number;
      pricingSource?: 'provider' | 'manual' | 'catalog' | 'none';
      origin?: 'memory';
      text?: string;
      reasoning?: string;
      toolCalls?: Array<{ id: string; name: string; args?: unknown }>;
      sources?: unknown[];
      files?: unknown[];
      finishReason?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'model.stats';
      tools: number;
      deferredPending: number;
      systemChars: number;
      notesChars: number;
      notesErrors: string[];
      plan?: RequestPlan;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'model.retry';
      attempt: number;
      maxRetries: number;
      delayMs: number;
      resumeAt?: number;
      message: string;
      code?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'compaction';
      id: string;
      reason: 'threshold' | 'manual';
      coveredFrom: number;
      coveredUntil: number;
      tokensBefore: number;
      tokensAfter: number;
      summary?: string;
      coveredUntilRunId?: string;
      coveredUntilSeq?: number;
      seq?: number;
      runId?: string;
      clientEventId?: string;
    }
  | {
      type: 'run.completed';
      text?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'run.cancelled';
      reason: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'run.failed';
      message: string;
      seq?: number;
      runId?: string;
    }
  | { type: 'run.resumed'; message: string; seq?: number; runId?: string }
  | {
      type: 'hook';
      hookId: string;
      event: string;
      status: string;
      handlerType: string;
      summary?: string;
      durationMs: number;
      seq?: number;
      runId?: string;
    }
  | { type: 'done'; text?: string; seq?: number; runId?: string }
  | {
      type: 'error';
      code: string;
      message: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'agent.handoff';
      agentId: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'agent.spawned';
      agentId: string;
      spawnId: string;
      taskInput?: unknown;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'agent.completed';
      agentId: string;
      spawnId: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'agent.failed';
      agentId: string;
      spawnId: string;
      code?: string;
      message?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'map.started';
      nodeId: string;
      count: number;
      concurrency?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'map.item.started';
      nodeId: string;
      index: number;
      workerId: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'map.item.completed';
      nodeId: string;
      index: number;
      workerId: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'map.item.failed';
      nodeId: string;
      index: number;
      workerId: string;
      code?: string;
      message?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'map.completed';
      nodeId: string;
      ok: number;
      failed: number;
      timedOut?: boolean;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'wait.started';
      askId: string;
      mode: 'sleep' | 'gate';
      fireAt?: number;
      source: 'timer' | 'wait';
      onTimeout?: 'fail' | 'continue' | 'interrupt';
      schema?: JsonSchema;
      prompt?: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'wait.resumed';
      nodeId: string;
      timedOut: boolean;
      source: 'timer' | 'respond';
      seq?: number;
      runId?: string;
    }
  | {
      type: 'placement.decided';
      profileId: string;
      profileSource: 'thread' | 'agent' | 'organization' | 'issue-rule';
      selectedNodeId?: string;
      unavailableReason?: string;
      requiredSources: Array<{ sourceId: string; access: 'read' | 'write' }>;
      candidates: Array<{
        nodeId: string;
        eligible: boolean;
        reasons: string[];
        activeClaims: number;
      }>;
      summary: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'memory';
      subtype: 'memory.consolidated' | 'memory.superseded' | 'memory.reflected';
      added?: number;
      updated?: number;
      superseded?: number;
      skipped?: number;
      facts?: Array<{ factId: string; action: 'added' | 'updated'; text: string }>;
      factId?: string;
      supersededById?: string;
      seq?: number;
      runId?: string;
    };
