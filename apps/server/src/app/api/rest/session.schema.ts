import { z } from 'zod';

export const SessionLoginBodySchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});
export type SessionLoginBody = z.infer<typeof SessionLoginBodySchema>;

export const SessionOwnerInitBodySchema = z.object({
  login: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(1),
});
export type SessionOwnerInitBody = z.infer<typeof SessionOwnerInitBodySchema>;

export const SessionTicketBodySchema = z.object({
  nodeId: z.string().min(1).optional(),
  actions: z.array(z.string().min(1)).min(1),
});
export type SessionTicketBody = z.infer<typeof SessionTicketBodySchema>;

export const SessionChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});
export type SessionChangePasswordBody = z.infer<typeof SessionChangePasswordBodySchema>;

export const SessionRevokeBodySchema = z.object({
  familyId: z.string().min(1),
});
export type SessionRevokeBody = z.infer<typeof SessionRevokeBodySchema>;
