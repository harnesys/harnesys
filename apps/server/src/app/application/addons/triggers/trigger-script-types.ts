import type {
  TriggerAgentMode,
  TriggerEscalate,
  TriggerPost,
  TriggerPre,
} from '@harnesys/contracts';
import type { TriggerScriptPendingPost } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';
import type { TriggerRunStatus } from './trigger-script-harness.ts';
import type { AgentlessDecision, PreScriptSkipReason } from './trigger-script-policy.ts';

export interface TriggerScriptContext {
  orgId: string;
  addonId: string;
  instanceId: string;
  triggerId: string;
  threadId: string;
  agentId: string;
  payload?: unknown;
  firedAt: string;
}

export interface RunPreScriptInput extends TriggerScriptContext {
  pre: TriggerPre;
}

export interface RunJobScriptInput extends TriggerScriptContext {
  pre: TriggerPre;
  mode: Exclude<TriggerAgentMode, 'always'>;
  escalate?: TriggerEscalate;
}

export interface JobScriptRunOutcome {
  decision: AgentlessDecision;
  cwd: string | null;
}

export interface PreScriptRunOutcome {
  proceed: boolean;
  cwd: string | null;
  reason?: PreScriptSkipReason;
  note?: string;
}

export interface RegisterPostScriptInput {
  context: TriggerScriptContext;
  post: TriggerPost;
  runId: string;
  cwd: string | null;
}

export interface RunPostNowInput {
  context: TriggerScriptContext;
  post: TriggerPost;
  cwd: string | null;
  runStatus: TriggerRunStatus;
}

export interface RunPostScriptInput {
  pending: TriggerScriptPendingPost;
  runStatus: TriggerRunStatus;
}

export interface RunBase {
  orgId: string;
  instanceId: string;
  addonId: string;
  stage: 'pre' | 'post';
  runId: string | null;
  cwd: string;
}

export interface PostIdentity {
  orgId: string;
  instanceId: string;
  addonId: string;
}
