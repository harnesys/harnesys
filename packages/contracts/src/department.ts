import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const DepartmentPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  name: z.string().min(1),
  parentId: z.string().uuid().nullable(),
  leadAgentId: z.string().uuid().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type DepartmentPublic = z.infer<typeof DepartmentPublicSchema>;

export const CreateDepartmentBodySchema = z.object({
  name: z.string().trim().min(1),
  parentId: z.string().uuid().nullable().optional(),
  leadAgentId: z.string().uuid().nullable().optional(),
});
export type CreateDepartmentBody = z.infer<typeof CreateDepartmentBodySchema>;

export const UpdateDepartmentBodySchema = CreateDepartmentBodySchema.partial();
export type UpdateDepartmentBody = z.infer<typeof UpdateDepartmentBodySchema>;

export const ListDepartmentsResponseSchema = z.object({
  items: z.array(DepartmentPublicSchema),
});
export type ListDepartmentsResponse = z.infer<typeof ListDepartmentsResponseSchema>;
