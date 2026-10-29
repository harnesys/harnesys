import { z } from 'zod';

export const VaultEntryKindSchema = z.enum(['secret', 'variable']);
export type VaultEntryKind = z.infer<typeof VaultEntryKindSchema>;

export const VaultEntryNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'name must be 1-64 chars: letter, then alnum/_/-');

export const VaultEntrySchema = z.object({
  name: z.string(),
  kind: VaultEntryKindSchema,
  value: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type VaultEntry = z.infer<typeof VaultEntrySchema>;

export const VaultListResponseSchema = z.object({
  items: z.array(VaultEntrySchema),
});
export type VaultListResponse = z.infer<typeof VaultListResponseSchema>;

export const PutVaultEntryBodySchema = z.object({
  kind: VaultEntryKindSchema,
  value: z.string().min(1),
});
export type PutVaultEntryBody = z.infer<typeof PutVaultEntryBodySchema>;
