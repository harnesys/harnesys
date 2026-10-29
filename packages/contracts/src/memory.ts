import { z } from 'zod';

export const PinSourceSchema = z.enum(['agent', 'human']);
export type PinSource = z.infer<typeof PinSourceSchema>;

export const PinRecordSchema = z.object({
  key: z.string().min(1),
  text: z.string(),
  updatedAt: z.string().min(1),
  source: PinSourceSchema,
});
export type PinRecord = z.infer<typeof PinRecordSchema>;

export const SemanticScopeSchema = z.enum(['session', 'long']);
export type SemanticScope = z.infer<typeof SemanticScopeSchema>;

export const MemoryRecordSourceSchema = z.enum(['agent', 'human', 'compaction']);
export type MemoryRecordSource = z.infer<typeof MemoryRecordSourceSchema>;

export const MemoryRecordSchema = z.object({
  id: z.string().min(1),
  scope: SemanticScopeSchema,
  text: z.string(),
  key: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  source: MemoryRecordSourceSchema,
  threadId: z.string().optional(),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const UpsertPinBodySchema = z.object({
  text: z.string().trim().min(1).max(20000),
});
export type UpsertPinBody = z.infer<typeof UpsertPinBodySchema>;

export const ListSemanticQuerySchema = z.object({
  scope: SemanticScopeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ListSemanticQuery = z.infer<typeof ListSemanticQuerySchema>;

export const UpsertSemanticBodySchema = z.object({
  scope: SemanticScopeSchema,
  text: z.string().trim().min(1).max(20000),
  key: z.string().trim().min(1).max(200).optional(),
  threadId: z.string().trim().min(1).optional(),
});
export type UpsertSemanticBody = z.infer<typeof UpsertSemanticBodySchema>;

export const UpdateSemanticBodySchema = z.object({
  text: z.string().trim().min(1).max(20000),
});
export type UpdateSemanticBody = z.infer<typeof UpdateSemanticBodySchema>;

export const MemorySettingsBodySchema = z.object({
  embedModelId: z.string().trim().min(1).nullable().optional(),
  decisionModelId: z.string().trim().min(1).nullable().optional(),
});
export type MemorySettingsBody = z.infer<typeof MemorySettingsBodySchema>;
