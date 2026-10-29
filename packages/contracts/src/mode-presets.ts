import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const MODE_OPS = ['fs.write', 'process', 'network', 'mcp', 'agents'] as const;
export const ModeOpSchema = z.enum(MODE_OPS);
export type ModeOp = z.infer<typeof ModeOpSchema>;

export const ModeOpGateSchema = z.enum(['allow', 'ask', 'deny']);
export type ModeOpGate = z.infer<typeof ModeOpGateSchema>;

export const ModeOpPermissionsSchema = z.partialRecord(ModeOpSchema, ModeOpGateSchema);
export type ModeOpPermissions = z.infer<typeof ModeOpPermissionsSchema>;

export const MODE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
export const DEFAULT_MODE_ID = 'default';

export const PackAssignmentSchema = z.union([
  z.literal(true),
  z.literal(false),
  z.object({ spec: z.record(z.string(), z.unknown()).optional() }),
  z.null(),
]);
export type PackAssignmentBody = z.infer<typeof PackAssignmentSchema>;

export const ModeToolExposureSchema = z.enum(['direct', 'deferred']);
export type ModeToolExposure = z.infer<typeof ModeToolExposureSchema>;

export const ModeDisabledToolsSchema = z.array(z.string().trim().min(1)).max(64);
export const ModeExposureMapSchema = z.record(z.string(), ModeToolExposureSchema);

export const ModePresetPublicSchema = z.object({
  orgId: OrgIdSchema,
  id: z.string().regex(MODE_ID_RE).max(48),
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  skills: z.array(z.string()).optional(),
  packs: z.record(z.string(), PackAssignmentSchema).optional(),
  disabledTools: ModeDisabledToolsSchema.optional(),
  exposure: ModeExposureMapSchema.optional(),
  permissions: ModeOpPermissionsSchema.optional(),
  builtin: z.boolean(),
  installedByDefault: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ModePresetPublic = z.infer<typeof ModePresetPublicSchema>;

const modePresetBodyShape = z.object({
  id: z.string().regex(MODE_ID_RE).max(48),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  instructions: z.string().max(6000).optional(),
  skills: z.array(z.string().trim().min(1)).max(32).optional(),
  packs: z.record(z.string(), PackAssignmentSchema).optional(),
  disabledTools: ModeDisabledToolsSchema.optional(),
  exposure: ModeExposureMapSchema.optional(),
  permissions: ModeOpPermissionsSchema.optional(),
  installedByDefault: z.boolean().optional(),
});

export const CreateModePresetBodySchema = modePresetBodyShape.refine(
  (body) => body.id !== DEFAULT_MODE_ID,
  {
    message: 'id "default" is reserved',
    path: ['id'],
  },
);
export type CreateModePresetBody = z.infer<typeof CreateModePresetBodySchema>;

export const UpdateModePresetBodySchema = modePresetBodyShape.partial().omit({ id: true });
export type UpdateModePresetBody = z.infer<typeof UpdateModePresetBodySchema>;

export const ListModePresetsResponseSchema = z.object({
  items: z.array(ModePresetPublicSchema),
});
export type ListModePresetsResponse = z.infer<typeof ListModePresetsResponseSchema>;
