import { z } from 'zod';

export const ResolveFleetSecretsBodySchema = z
  .object({
    runId: z.string().trim().min(1).optional(),
    operationId: z.string().trim().min(1).optional(),
    names: z.array(z.string().trim().min(1)).min(1),
  })
  .refine(
    (value) => {
      const hasRun = Boolean(value.runId);
      const hasOp = Boolean(value.operationId);
      return (hasRun && !hasOp) || (!hasRun && hasOp);
    },
    { message: 'exactly one of runId or operationId is required' },
  );
export type ResolveFleetSecretsBody = z.infer<typeof ResolveFleetSecretsBodySchema>;

export const ResolveFleetSecretsResponseSchema = z.object({
  values: z.record(z.string(), z.string()),
});
export type ResolveFleetSecretsResponse = z.infer<typeof ResolveFleetSecretsResponseSchema>;

export const ClaimWorkBodySchema = z.object({
  nodeId: z.string().trim().min(1),
});
export type ClaimWorkBody = z.infer<typeof ClaimWorkBodySchema>;

export const TaskEnvelopeAttachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  kind: z.enum(['image', 'audio', 'video', 'file']),
});
export type TaskEnvelopeAttachment = z.infer<typeof TaskEnvelopeAttachmentSchema>;

export const TaskEnvelopeIsolationSchema = z.object({
  mode: z.literal('container'),
  image: z.string().min(1),
});
export type TaskEnvelopeIsolation = z.infer<typeof TaskEnvelopeIsolationSchema>;

export const TaskEnvelopeAttributionSchema = z.object({
  startedByUserId: z.string().min(1).optional(),
  via: z.enum(['direct', 'agent']),
  onNodeId: z.string().min(1).nullable().optional(),
});
export type TaskEnvelopeAttribution = z.infer<typeof TaskEnvelopeAttributionSchema>;

export const TaskEnvelopeSchema = z.object({
  threadId: z.string().uuid(),
  runId: z.string().uuid(),
  agentId: z.string().uuid(),
  secretNames: z.array(z.string()),
  varNames: z.array(z.string()),
  leaseEpoch: z.number().int().nonnegative(),
  expiresAt: z.string().min(1),
  inputText: z.string().optional(),
  relayLastSeq: z.number().int().nonnegative().optional(),
  configRevision: z.number().int().nonnegative(),
  effort: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  modeShellSpec: z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(TaskEnvelopeAttachmentSchema).default([]),
  directory: z.string().min(1).optional(),
  sourceId: z.string().uuid().optional(),
  worktreeId: z.string().uuid().optional(),
  isolation: TaskEnvelopeIsolationSchema.optional(),
  attribution: TaskEnvelopeAttributionSchema.optional(),
});
export type TaskEnvelope = z.infer<typeof TaskEnvelopeSchema>;

export const ClaimWorkResponseSchema = z.object({
  envelope: TaskEnvelopeSchema.nullable(),
});
export type ClaimWorkResponse = z.infer<typeof ClaimWorkResponseSchema>;

export const RunEventFrameSchema = z.object({
  kind: z.literal('RUN_EVENT'),
  runId: z.string().uuid(),
  leaseEpoch: z.number().int().nonnegative(),
  fromSeq: z.number().int().nonnegative(),
  events: z.array(z.record(z.string(), z.unknown())),
});
export type RunEventFrame = z.infer<typeof RunEventFrameSchema>;
