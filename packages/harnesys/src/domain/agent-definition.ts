import type { AgentHook, AgentLevel, MemoryPolicy } from '@harnesys/contracts';
import { validateStructural } from '../application/validate.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import { ValidationError } from './errors.ts';
import type { Expr } from './expr.ts';
import type { JsonSchema } from './json-schema.ts';
import type { AgentPacks, PackConfig } from './pack.ts';
export type InterruptReason =
  | 'human_review'
  | 'policy'
  | 'uncertain_effect'
  | 'definition_migrated'
  | 'work'
  | 'wait';
export interface AgentGenerationSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  maxTokens?: number;
  contextWindowTokens?: number;
}
export interface AgentModelRef {
  provider: string;
  model: string;
  effort?: string;
  generation?: AgentGenerationSettings;
}
export type PortRef = {
  name: string;
  version?: string;
  spec?: Record<string, unknown>;
} | null;
export interface AgentPaths {
  allow: string[];
  cwd?: string;
}
export interface ToolOutputSettings {
  maxChars?: number;
  headChars?: number;
  tailChars?: number;
  redactSecrets?: boolean;
}
export type RawRequestMode = 'meta' | 'full' | 'off';
export interface AgentObservability {
  rawRequests?: RawRequestMode;
}
export type AgentNodes = Record<string, Node>;
export type AgentEdges = Edge[];
export interface AgentGraph {
  nodes: AgentNodes;
  edges: AgentEdges;
}
export type BudgetPolicy = 'ask' | 'error';
export type BudgetLimitKind = 'steps' | 'tokens' | 'deadline';
export type SpawnBudgetMode = 'pool' | 'inherit';
export interface AgentBudget {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
  warnAtSteps?: number;
  closeOnExhaustion?: boolean;
  extendDefaultPct?: number;
  spawnBudget?: SpawnBudgetMode;
}
export interface BudgetExtension {
  steps?: number;
  tokens?: number;
  ms?: number;
}
export type MapInstruction = string;
export type MapMaxTokensPerItem = number;
export interface AgentDefinition {
  id: string;
  version?: string;
  level?: AgentLevel;
  prompts: Record<
    string,
    {
      instructions: string;
    }
  >;
  model?: AgentModelRef;
  models?: Record<string, AgentModelRef>;
  fallback?: AgentModelRef[];
  generation?: AgentGenerationSettings;
  skills?: string[];
  disallowedTools?: string[];
  mcpServers?: string[];
  toolOutput?: ToolOutputSettings;
  observability?: AgentObservability;
  compaction?: PortRef;
  memoryPolicy?: MemoryPolicy;
  paths?: AgentPaths;
  state?: {
    initial: Record<string, Expr | unknown>;
    reducers?: Record<string, 'replace' | 'merge'>;
  };
  graph: AgentGraph;
  budget?: AgentBudget;
  packs?: AgentPacks;
  permissions?: PermissionMap;
  capabilities?: Record<string, PackConfig | null>;
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
}
export interface Edge {
  from: string;
  to: string;
  when?: Expr;
}
export interface ToolCallFixed {
  type: 'tool:call';
  name: string;
  args: Record<string, Expr | unknown>;
  calls?: never;
  concurrency?: never;
  approve?: never;
}
export interface ToolCallBatch {
  type: 'tool:call';
  calls: Expr;
  concurrency: Expr | 'parallel' | 'sequential';
  barrier?: {
    policy: 'all';
  };
  approve?: {
    tools: string[];
    reason: string;
    resumeSchema: JsonSchema;
  };
  name?: never;
  args?: never;
}
export interface NodePlacement {
  node?: string;
  tag?: string;
  sameAsParent?: boolean;
}
export type Node =
  | {
      type: 'core:start';
    }
  | {
      type: 'core:end';
      output?: Expr;
    }
  | {
      type: 'llm:generate';
      model?: string | AgentModelRef;
      prompt: string;
      messages?: Expr;
      tools?: string[];
      output?: JsonSchema;
    }
  | ToolCallFixed
  | ToolCallBatch
  | {
      type: 'control:assign';
      patch: Record<string, Expr | unknown>;
    }
  | {
      type: 'control:spawn';
      calls: Expr;
      concurrency: Expr | 'parallel' | 'sequential';
      barrier?: {
        policy: 'all';
      };
      maxConcurrency?: number;
      timeoutMs?: number;
      onTimeout?: 'partial' | 'fail';
    }
  | {
      type: 'control:map';
      items: Expr;
      enter: string;
      body: string[];
      concurrency: Expr | 'parallel' | 'sequential';
      barrier?: {
        policy: 'all';
      };
      timeoutMs?: number;
      onTimeout?: 'fail' | 'partial';
      instruction?: MapInstruction;
      maxTokensPerItem?: MapMaxTokensPerItem;
    }
  | {
      type: 'control:yield';
      value?: Expr;
    }
  | {
      type: 'control:goto';
      target: Expr;
    }
  | {
      type: 'control:interrupt';
      reason: InterruptReason;
      resumeSchema: JsonSchema;
    }
  | {
      type: 'control:wait';
      delayMs?: number;
      untilMs?: Expr;
      timeoutMs?: number;
      onTimeout?: 'fail' | 'continue' | 'interrupt';
      reason?: InterruptReason;
      resumeSchema?: JsonSchema;
    }
  | {
      type: 'control:handoff';
      agentId: string | Expr;
      input: Expr | Record<string, Expr | unknown>;
    }
  | {
      type: `custom:${string}`;
      config?: JsonSchema | unknown;
    };
export function defineAgent(def: AgentDefinition): AgentDefinition {
  const diags = validateStructural(def);
  const errors = diags.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
  return JSON.parse(JSON.stringify(def)) as AgentDefinition;
}
