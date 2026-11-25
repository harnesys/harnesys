import { z } from 'zod';
import { HookRunStatusSchema } from './agent-hooks.ts';

export const TRIGGER_SCRIPT_ENV_KEY = /^[A-Z_][A-Z0-9_]*$/;

export const TriggerScriptShellSchema = z.enum(['bash', 'zsh', 'sh', 'powershell']);
export type TriggerScriptShell = z.infer<typeof TriggerScriptShellSchema>;

export const TriggerScriptSchema = z.object({
  command: z.string().trim().min(1).max(8000),
  args: z.array(z.string().max(4000)).max(64).optional(),
  shell: TriggerScriptShellSchema.default('bash'),
  timeoutS: z.number().int().min(1).max(600).default(30),
  env: z
    .record(
      z.string().regex(TRIGGER_SCRIPT_ENV_KEY, 'env keys must match ^[A-Z_][A-Z0-9_]*$'),
      z.string().max(4000),
    )
    .optional(),
});
export type TriggerScript = z.infer<typeof TriggerScriptSchema>;

export const TriggerGateSchema = z
  .discriminatedUnion('on', [
    z.object({
      on: z.literal('exit-code'),
      pass: z.array(z.number().int()).min(1).default([0]),
    }),
    z.object({
      on: z.literal('stdout'),
      match: z.enum(['contains', 'regex']),
      value: z.string().min(1).max(4000),
    }),
    z.object({
      on: z.literal('json'),
      path: z.string().min(1).max(400),
      op: z.enum(['truthy', 'exists', 'equals']),
      value: z.unknown().optional(),
    }),
  ])
  .superRefine((gate, ctx) => {
    if (gate.on !== 'stdout' || gate.match !== 'regex') {
      return;
    }
    try {
      new RegExp(gate.value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'invalid regular expression',
      });
    }
  });
export type TriggerGate = z.infer<typeof TriggerGateSchema>;

export const TriggerPreOnErrorSchema = z.enum(['skip-run', 'run-with-note', 'ignore']);
export type TriggerPreOnError = z.infer<typeof TriggerPreOnErrorSchema>;

export const TriggerPreWorkspacePolicySchema = z.enum(['skip-run', 'fail']);
export type TriggerPreWorkspacePolicy = z.infer<typeof TriggerPreWorkspacePolicySchema>;

export const TriggerPreSchema = z.object({
  script: TriggerScriptSchema,
  gate: TriggerGateSchema.optional(),
  onError: TriggerPreOnErrorSchema.default('skip-run'),
  injectStdout: z.boolean().default(false),
  onWorkspaceMissing: TriggerPreWorkspacePolicySchema.default('skip-run'),
});
export type TriggerPre = z.infer<typeof TriggerPreSchema>;

export const TriggerPostWhenSchema = z.enum(['always', 'success', 'failure']);
export type TriggerPostWhen = z.infer<typeof TriggerPostWhenSchema>;

export const TriggerPostSchema = z.object({
  script: TriggerScriptSchema,
  when: TriggerPostWhenSchema.default('always'),
});
export type TriggerPost = z.infer<typeof TriggerPostSchema>;

export const TriggerScriptsSchema = z.object({
  acknowledged: z.boolean().default(false),
  pre: TriggerPreSchema.optional(),
  post: TriggerPostSchema.optional(),
});
export type TriggerScripts = z.infer<typeof TriggerScriptsSchema>;

export function hasTriggerScripts(scripts: TriggerScripts | undefined): boolean {
  return scripts?.pre !== undefined || scripts?.post !== undefined;
}

export const TriggerScriptStageSchema = z.enum(['pre', 'post']);
export type TriggerScriptStage = z.infer<typeof TriggerScriptStageSchema>;

export const TriggerGateVerdictSchema = z.enum(['passed', 'unmatched', 'not-applied']);
export type TriggerGateVerdict = z.infer<typeof TriggerGateVerdictSchema>;

export const TriggerScriptRunViewSchema = z.object({
  id: z.string().min(1),
  instanceId: z.string().min(1),
  addonId: z.string().min(1),
  stage: TriggerScriptStageSchema,
  runId: z.string().nullable().default(null),
  status: HookRunStatusSchema,
  exitCode: z.number().int().nullable().default(null),
  durationMs: z.number().int().nonnegative(),
  cwd: z.string(),
  gateVerdict: TriggerGateVerdictSchema.nullable().default(null),
  summary: z.string().nullable().default(null),
  stdout: z.string().default(''),
  stderr: z.string().default(''),
  createdAt: z.string().min(1),
});
export type TriggerScriptRunView = z.infer<typeof TriggerScriptRunViewSchema>;

export const TriggerScriptRunListSchema = z.object({
  items: z.array(TriggerScriptRunViewSchema).default([]),
});
export type TriggerScriptRunList = z.infer<typeof TriggerScriptRunListSchema>;

export const TriggerScriptTestRequestSchema = z.object({
  script: TriggerScriptSchema,
  gate: TriggerGateSchema.optional(),
});
export type TriggerScriptTestRequest = z.infer<typeof TriggerScriptTestRequestSchema>;

export const TriggerScriptTestResponseSchema = z.object({
  status: HookRunStatusSchema,
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  cwd: z.string(),
  gateVerdict: TriggerGateVerdictSchema,
  stdout: z.string(),
  stderr: z.string(),
});
export type TriggerScriptTestResponse = z.infer<typeof TriggerScriptTestResponseSchema>;
