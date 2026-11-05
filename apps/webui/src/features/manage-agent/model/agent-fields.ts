import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMode,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import type { PermissionMap } from 'harnesys';
import { z } from 'zod';
import { generationSettingsOf } from './agent-generation-settings';
import { agentModesSchema, fieldsToMode, modeToFields } from './agent-mode-fields';

const optionalAmount = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : Number(value)));
const optionalPositiveInt = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 1),
    'Must be a positive number',
  )
  .transform((value) => (value === '' ? undefined : Math.floor(Number(value))));
const optionalNonNegativeInt = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0),
    'Must be zero or a positive number',
  )
  .transform((value) => (value === '' ? undefined : Math.floor(Number(value))));
export const agentFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Name required'),
  role: z.string(),
  instructions: z.string(),
  modelId: z.string().nullable(),
  effort: z.string().nullable(),
  temperature: optionalAmount,
  topP: optionalAmount,
  frequencyPenalty: optionalAmount,
  presencePenalty: optionalAmount,
  seed: optionalAmount,
  maxTokens: optionalAmount,
  contextWindowTokens: optionalAmount,
  reasoningMode: z.enum(['strip', 'part', 'keep']),
  reasoningKeepRounds: optionalNonNegativeInt,
  streamIdleTimeoutMs: optionalPositiveInt,
  providerRetryAttempts: optionalPositiveInt,
  ctxUsageAnchor: z.boolean(),
  ctxLengthCutContinuations: optionalNonNegativeInt,
  ctxSpawnHeadChars: optionalNonNegativeInt,
  ctxSpawnTailChars: optionalNonNegativeInt,
  toolOutputMaxChars: optionalPositiveInt,
  toolOutputHeadChars: optionalPositiveInt,
  toolOutputTailChars: optionalPositiveInt,
  toolOutputRedactSecrets: z.boolean(),
  budgetMaxSteps: optionalPositiveInt,
  budgetMaxTokens: optionalPositiveInt,
  budgetDeadlineSec: optionalPositiveInt,
  budgetUsdDaily: optionalAmount,
  budgetPolicy: z.enum(['ask', 'error']),
  budgetWarnAtSteps: optionalNonNegativeInt,
  budgetCloseOnExhaustion: z.boolean(),
  budgetExtendPercent: optionalPositiveInt,
  budgetSpawnMode: z.enum(['pool', 'inherit']),
  defaultModeId: z.string().nullable(),
  executionProfileId: z.string().nullable(),
  modes: agentModesSchema,
  permissions: z
    .record(z.string(), z.enum(['allow', 'ask', 'deny']))
    .nullable()
    .optional(),
  color: z.string().nullable().optional(),
  memoryPolicy: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type AgentFieldsInput = z.input<typeof agentFieldsSchema>;
export type AgentFieldsOutput = z.output<typeof agentFieldsSchema>;
export type AgentGenerationField =
  | 'temperature'
  | 'topP'
  | 'frequencyPenalty'
  | 'presencePenalty'
  | 'seed'
  | 'maxTokens'
  | 'contextWindowTokens'
  | 'reasoningMode';
export function emptyAgentFields(): AgentFieldsInput {
  return {
    name: '',
    role: 'Operator',
    instructions: '',
    modelId: null,
    effort: null,
    temperature: '',
    topP: '',
    frequencyPenalty: '',
    presencePenalty: '',
    seed: '',
    maxTokens: '',
    contextWindowTokens: '',
    reasoningMode: 'strip',
    reasoningKeepRounds: '',
    streamIdleTimeoutMs: '',
    providerRetryAttempts: '',
    ctxUsageAnchor: true,
    ctxLengthCutContinuations: '',
    ctxSpawnHeadChars: '',
    ctxSpawnTailChars: '',
    toolOutputMaxChars: '',
    toolOutputHeadChars: '',
    toolOutputTailChars: '',
    toolOutputRedactSecrets: false,
    budgetMaxSteps: '',
    budgetMaxTokens: '',
    budgetDeadlineSec: '',
    budgetUsdDaily: '',
    budgetPolicy: 'ask',
    budgetWarnAtSteps: '',
    budgetCloseOnExhaustion: false,
    budgetExtendPercent: '',
    budgetSpawnMode: 'pool',
    defaultModeId: null,
    executionProfileId: null,
    modes: [],
    permissions: null,
    color: null,
    memoryPolicy: null,
  };
}
export function agentFieldsFrom(agent: {
  name: string;
  role: string;
  instructions: string;
  modelId: string | null;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
  budgetUsdDaily?: number | null;
  defaultModeId?: string | null;
  executionProfileId?: string | null;
  modes?: AgentMode[];
  permissions?: PermissionMap | null;
  color?: string | null;
  memoryPolicy?: Record<string, unknown> | null;
}): AgentFieldsInput {
  return {
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions,
    modelId: agent.modelId,
    effort: agent.effort ?? null,
    defaultModeId: agent.defaultModeId ?? null,
    executionProfileId: agent.executionProfileId ?? null,
    modes: (agent.modes ?? []).map(modeToFields),
    permissions: agent.permissions ?? null,
    color: agent.color ?? null,
    memoryPolicy: agent.memoryPolicy ?? null,
    temperature: stringify(agent.generation?.temperature),
    topP: stringify(agent.generation?.topP),
    frequencyPenalty: stringify(agent.generation?.frequencyPenalty),
    presencePenalty: stringify(agent.generation?.presencePenalty),
    seed: stringify(agent.generation?.seed),
    maxTokens: stringify(agent.generation?.maxTokens),
    contextWindowTokens: stringify(agent.generation?.contextWindowTokens),
    reasoningMode: reasoningModeOf(agent.generation),
    reasoningKeepRounds: stringify(agent.generation?.reasoningKeepRounds),
    streamIdleTimeoutMs: stringify(agent.generation?.streamIdleTimeoutMs),
    providerRetryAttempts: stringify(agent.generation?.providerRetryAttempts),
    ctxUsageAnchor: agent.generation?.context?.usageAnchor ?? true,
    ctxLengthCutContinuations: stringify(agent.generation?.context?.lengthCutContinuations),
    ctxSpawnHeadChars: stringify(agent.generation?.context?.spawnResultHeadChars),
    ctxSpawnTailChars: stringify(agent.generation?.context?.spawnResultTailChars),
    toolOutputMaxChars: stringify(agent.toolOutput?.maxChars),
    toolOutputHeadChars: stringify(agent.toolOutput?.headChars),
    toolOutputTailChars: stringify(agent.toolOutput?.tailChars),
    toolOutputRedactSecrets: agent.toolOutput?.redactSecrets === true,
    budgetMaxSteps: stringify(agent.budget?.maxSteps),
    budgetMaxTokens: stringify(agent.budget?.maxTokens),
    budgetDeadlineSec:
      agent.budget?.deadlineMs !== undefined
        ? stringify(Math.round(agent.budget.deadlineMs / 1000))
        : '',
    budgetUsdDaily: stringify(agent.budgetUsdDaily ?? undefined),
    budgetPolicy: agent.budget?.policy ?? 'ask',
    budgetWarnAtSteps: stringify(agent.budget?.warnAtSteps ?? 3),
    budgetCloseOnExhaustion: agent.budget?.closeOnExhaustion ?? false,
    budgetExtendPercent: stringify(agent.budget?.extendDefaultPct ?? 25),
    budgetSpawnMode: agent.budget?.spawnBudget ?? 'pool',
  };
}
function reasoningModeOf(
  generation: AgentGenerationSettings | null | undefined,
): 'strip' | 'part' | 'keep' {
  if (generation?.stripReasoning !== false) {
    return 'strip';
  }
  return generation.reasoningKeepRounds !== undefined ? 'part' : 'keep';
}
export function toAgentDraft(values: AgentFieldsOutput): {
  name: string;
  role: string;
  instructions: string;
  modelId: string | null;
  effort: string | null;
  generation: AgentGenerationSettings | null;
  toolOutput: ToolOutputSettings | null;
  budget: AgentBudget | null;
  budgetUsdDaily: number | null;
  defaultModeId: string | null;
  executionProfileId: string | null;
  modes: AgentMode[];
  permissions: PermissionMap | null;
  color: string | null;
  memoryPolicy: Record<string, unknown> | null;
} {
  const generation = compactGeneration(generationSettingsOf(values));
  const limits = {
    maxSteps: values.budgetMaxSteps,
    maxTokens: values.budgetMaxTokens,
    deadlineMs:
      values.budgetDeadlineSec !== undefined ? values.budgetDeadlineSec * 1000 : undefined,
  };
  const hasLimit =
    limits.maxSteps !== undefined ||
    limits.maxTokens !== undefined ||
    limits.deadlineMs !== undefined;
  const budget = hasLimit
    ? {
        ...(limits.maxSteps !== undefined ? { maxSteps: limits.maxSteps } : {}),
        ...(limits.maxTokens !== undefined ? { maxTokens: limits.maxTokens } : {}),
        ...(limits.deadlineMs !== undefined ? { deadlineMs: limits.deadlineMs } : {}),
        policy: values.budgetPolicy,
        ...(values.budgetWarnAtSteps !== undefined
          ? { warnAtSteps: values.budgetWarnAtSteps }
          : {}),
        ...(values.budgetCloseOnExhaustion ? { closeOnExhaustion: true } : {}),
        ...(values.budgetExtendPercent !== undefined
          ? { extendDefaultPct: values.budgetExtendPercent }
          : {}),
        ...(values.budgetSpawnMode === 'inherit' ? { spawnBudget: 'inherit' as const } : {}),
      }
    : null;
  return {
    name: values.name,
    role: values.role,
    instructions: values.instructions,
    modelId: values.modelId,
    effort: values.effort,
    defaultModeId: values.defaultModeId,
    executionProfileId: values.executionProfileId,
    modes: values.modes.map(fieldsToMode),
    generation,
    toolOutput: compactToolOutput({
      maxChars: values.toolOutputMaxChars,
      headChars: values.toolOutputHeadChars,
      tailChars: values.toolOutputTailChars,
      ...(values.toolOutputRedactSecrets ? { redactSecrets: true } : {}),
    }),
    budget,
    budgetUsdDaily: values.budgetUsdDaily ?? null,
    permissions: values.permissions ?? null,
    color: values.color ?? null,
    memoryPolicy: values.memoryPolicy ?? null,
  };
}
function compactGeneration(settings: AgentGenerationSettings): AgentGenerationSettings | null {
  if (!settings) {
    return null;
  }
  const out: AgentGenerationSettings = {};
  let wrote = false;
  for (const key of Object.keys(settings) as (keyof AgentGenerationSettings)[]) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    (out as Record<string, unknown>)[key] = value;
    wrote = true;
  }
  return wrote ? out : null;
}
function compactToolOutput(settings: ToolOutputSettings): ToolOutputSettings | null {
  const out: ToolOutputSettings = {};
  let wrote = false;
  for (const key of Object.keys(settings) as (keyof ToolOutputSettings)[]) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    (out as Record<string, unknown>)[key] = value;
    wrote = true;
  }
  return wrote ? out : null;
}
function stringify(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
