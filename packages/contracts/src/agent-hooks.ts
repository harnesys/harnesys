import { z } from 'zod';

export const HOOK_EVENT_NAMES = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'Notification',
  'PermissionRequest',
  'PermissionDenied',
  'PreModelCall',
  'PostModelCall',
  'NodeStart',
  'NodeEnd',
] as const;

export const HookEventNameSchema = z.enum(HOOK_EVENT_NAMES);
export type AgentHookEvent = z.infer<typeof HookEventNameSchema>;

export const HookCommandShellSchema = z.enum(['bash', 'powershell']);
export type HookCommandShell = z.infer<typeof HookCommandShellSchema>;

export const HookHandlerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('command'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    shell: HookCommandShellSchema.optional(),
    timeoutS: z.number().optional(),
    async: z.boolean().optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    timeoutS: z.number().optional(),
  }),
  z.object({
    type: z.literal('mcp_tool'),
    server: z.string(),
    tool: z.string(),
    input: z.record(z.string(), z.string()).optional(),
    timeoutS: z.number().optional(),
  }),
  z.object({
    type: z.literal('prompt'),
    prompt: z.string(),
    model: z.string().optional(),
    timeoutS: z.number().optional(),
  }),
  z.object({
    type: z.literal('agent'),
    agentId: z.string().optional(),
    prompt: z.string(),
    model: z.string().optional(),
    timeoutS: z.number().optional(),
  }),
]);
export type HookHandlerSpec = z.infer<typeof HookHandlerSchema>;
export type HookHandlerType = 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent';

export const AgentHookSchema = z.object({
  id: z.string().optional(),
  event: HookEventNameSchema,
  matcher: z.string().optional(),
  handler: HookHandlerSchema,
  enabled: z.boolean().optional(),
  timeoutS: z.number().optional(),
});
export type AgentHook = z.infer<typeof AgentHookSchema>;

export const AgentHooksSchema = z.array(AgentHookSchema).max(50);
export type AgentHooks = z.infer<typeof AgentHooksSchema>;

export const HookEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('block'), reason: z.string() }),
  z.object({ kind: z.literal('context'), text: z.string() }),
  z.object({ kind: z.literal('update_input'), input: z.unknown() }),
  z.object({ kind: z.literal('update_output'), output: z.unknown() }),
  z.object({ kind: z.literal('ask'), reason: z.string() }),
  z.object({ kind: z.literal('stop'), reason: z.string().optional() }),
  z.object({ kind: z.literal('remind'), text: z.string() }),
]);
export type AgentHookEffect = z.infer<typeof HookEffectSchema>;

export const HookRunStatusSchema = z.enum([
  'ok',
  'blocked',
  'failed',
  'timeout',
  'skipped',
  'denied',
]);
export type HookRunStatus = z.infer<typeof HookRunStatusSchema>;

export const HookDiagnosticSchema = z.object({
  level: z.enum(['warning', 'error']),
  code: z.string(),
  message: z.string(),
});
export type HookDiagnostic = z.infer<typeof HookDiagnosticSchema>;

export const HookRunSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  hookId: z.string().min(1),
  event: HookEventNameSchema,
  handlerType: z.string().min(1),
  status: HookRunStatusSchema,
  durationMs: z.number().int().nonnegative(),
  summary: z.string().optional(),
  errorCode: z.string().optional(),
  effects: z.array(HookEffectSchema),
  runId: z.string().optional(),
  threadId: z.string().optional(),
  createdAt: z.string().min(1),
});
export type HookRun = z.infer<typeof HookRunSchema>;

export const HookRunListResponseSchema = z.object({
  items: z.array(HookRunSchema),
});
export type HookRunListResponse = z.infer<typeof HookRunListResponseSchema>;

export const HookRunListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type HookRunListQuery = z.infer<typeof HookRunListQuerySchema>;

export const HookTestRequestSchema = z.object({
  hook: AgentHookSchema,
});
export type HookTestRequest = z.infer<typeof HookTestRequestSchema>;

export const HookTestResponseSchema = z.object({
  status: HookRunStatusSchema,
  durationMs: z.number().int().nonnegative(),
  output: z.string().optional(),
  effects: z.array(HookEffectSchema),
  diagnostics: z.array(HookDiagnosticSchema),
});
export type HookTestResponse = z.infer<typeof HookTestResponseSchema>;
