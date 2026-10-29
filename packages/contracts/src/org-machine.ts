import { z } from 'zod';

export const OrgIdSchema = z.string().uuid();
export type OrgId = z.infer<typeof OrgIdSchema>;

export const MachineOrgRoleSchema = z.enum(['relay', 'worker']);
export type MachineOrgRole = z.infer<typeof MachineOrgRoleSchema>;

export const MachineOrgEntrySchema = z.object({
  orgId: OrgIdSchema,
  name: z.string().min(1),
  description: z.string().max(500).default(''),
  role: MachineOrgRoleSchema,
  relayUrl: z.string().min(1).nullable().optional(),
});
export type MachineOrgEntry = z.infer<typeof MachineOrgEntrySchema>;

export const CreateOrgBodySchema = z.object({
  name: z.string().min(1),
  workspacePath: z.string().trim().min(1).optional(),
});
export type CreateOrgBody = z.infer<typeof CreateOrgBodySchema>;

export const UpdateOrgBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().max(500).optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: 'at least one of name or description is required',
  });
export type UpdateOrgBody = z.infer<typeof UpdateOrgBodySchema>;

export const OrgMachineFileSchema = z.object({
  version: z.literal(1),
  orgs: z.array(MachineOrgEntrySchema),
  activeOrgId: OrgIdSchema.nullable(),
});
export type OrgMachineFile = z.infer<typeof OrgMachineFileSchema>;

export const OrgsListResponseSchema = z.object({
  orgs: z.array(MachineOrgEntrySchema),
  activeOrgId: OrgIdSchema.nullable(),
});
export type OrgsListResponse = z.infer<typeof OrgsListResponseSchema>;
