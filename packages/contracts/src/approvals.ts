import { z } from 'zod';

export const ApprovalOptionSchema = z.enum([
  'approve',
  'approve_once',
  'deny',
  'block_path',
  'close',
]);
export type ApprovalOption = z.infer<typeof ApprovalOptionSchema>;

export const APPROVAL_PARK_SOURCES = ['permission', 'approve', 'budget', 'interrupt'] as const;
export type ApprovalParkSource = (typeof APPROVAL_PARK_SOURCES)[number];

export const ApprovalKindSchema = z.enum(['tool', 'spend', 'memory', 'question', 'file_access']);
export type ApprovalKind = z.infer<typeof ApprovalKindSchema>;

export const ApprovalBudgetKindSchema = z.enum(['steps', 'tokens', 'deadline']);
export type ApprovalBudgetKind = z.infer<typeof ApprovalBudgetKindSchema>;

export const ApprovalBudgetSchema = z.object({
  kind: ApprovalBudgetKindSchema,
  limit: z.number(),
  used: z.number(),
  defaultExtend: z.number().int().positive(),
});
export type ApprovalBudget = z.infer<typeof ApprovalBudgetSchema>;

export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'denied',
  'cancelled',
  'superseded',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalSurfaceSchema = z.enum(['web', 'telegram', 'push', 'system']);
export type ApprovalSurface = z.infer<typeof ApprovalSurfaceSchema>;

export const ApprovalDecisionScopeSchema = z.enum(['once', 'run', 'always']);
export type ApprovalDecisionScope = z.infer<typeof ApprovalDecisionScopeSchema>;

export const FileApprovalContextSchema = z.object({
  host: z.string().min(1),
  canonicalPath: z.string().min(1),
  requestedPath: z.string().min(1),
  action: z.enum(['read', 'edit']),
  runtime: z.enum(['host', 'container']),
});
export type FileApprovalContext = z.infer<typeof FileApprovalContextSchema>;

export const ApprovalContextSchema = z
  .object({
    source: z.string(),
    ops: z.array(z.string()).optional(),
    tool: z
      .object({
        name: z.string(),
        inputPreview: z.string().optional(),
        command: z.string().optional(),
        truncated: z.boolean().optional(),
      })
      .optional(),
    note: z.string().optional(),
    override: z.object({ ops: z.array(z.string()) }).optional(),
    budget: ApprovalBudgetSchema.optional(),
    file: FileApprovalContextSchema.optional(),
    delegated: z
      .object({
        agentId: z.string().optional(),
        agentType: z.string().optional(),
        spawnPath: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();
export type ApprovalContext = z.infer<typeof ApprovalContextSchema>;

export const ApprovalPublicSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  agentId: z.string().uuid(),
  threadId: z.string().uuid().nullable(),
  interruptId: z.string().min(1),
  kind: ApprovalKindSchema,
  question: z.string(),
  options: z.array(ApprovalOptionSchema),
  context: ApprovalContextSchema,
  status: ApprovalStatusSchema,
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionSeq: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
});
export type ApprovalPublic = z.infer<typeof ApprovalPublicSchema>;

export const ListApprovalsQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
export type ListApprovalsQuery = z.infer<typeof ListApprovalsQuerySchema>;

export const ListApprovalsResponseSchema = z.object({
  items: z.array(ApprovalPublicSchema),
});
export type ListApprovalsResponse = z.infer<typeof ListApprovalsResponseSchema>;

export const CreateApprovalBodySchema = z.object({
  runId: z.string().uuid(),
  agentId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  interruptId: z.string().min(1),
  kind: ApprovalKindSchema,
  question: z.string().min(1),
  options: z.array(ApprovalOptionSchema).min(1),
  context: ApprovalContextSchema.optional(),
});
export type CreateApprovalBody = z.infer<typeof CreateApprovalBodySchema>;

export const CommandApprovalRuleSchema = z.object({
  kind: z.enum(['exact', 'program', 'prefix']),
  pattern: z.string().trim().min(1),
  target: z.enum(['agent', 'global']),
  commandScope: z.enum(['exact', 'segments']).optional(),
});
export type CommandApprovalRule = z.infer<typeof CommandApprovalRuleSchema>;

export const FileApprovalRuleSchema = z.object({
  kind: z.literal('file-path'),
  pattern: z.string().trim().min(1).optional(),
  target: z.enum(['agent', 'global']),
  effect: z.enum(['allow', 'deny']).default('allow'),
  hostId: z.string().min(1).optional(),
});
export type FileApprovalRule = z.infer<typeof FileApprovalRuleSchema>;

export const ApprovalRuleSchema = z.discriminatedUnion('kind', [
  CommandApprovalRuleSchema,
  FileApprovalRuleSchema,
]);
export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;

export const DecideApprovalBodySchema = z.object({
  decision: ApprovalOptionSchema,
  surface: ApprovalSurfaceSchema,
  note: z.string().optional(),
  rule: ApprovalRuleSchema.optional(),
  scope: ApprovalDecisionScopeSchema.optional(),
  extend: z.number().int().positive().optional(),
});
export type DecideApprovalBody = z.infer<typeof DecideApprovalBodySchema>;

export const ApprovalResumeAppliedStateSchema = z.enum(['decided', 'applied']);
export type ApprovalResumeAppliedState = z.infer<typeof ApprovalResumeAppliedStateSchema>;

export const DecideApprovalResponseSchema = z.object({
  winner: z.boolean(),
  status: ApprovalStatusSchema,
  resumed: z.boolean(),
  resumeState: ApprovalResumeAppliedStateSchema,
});
export type DecideApprovalResponse = z.infer<typeof DecideApprovalResponseSchema>;
