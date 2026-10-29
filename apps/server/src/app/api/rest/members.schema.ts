import { z } from 'zod';

export const MemberInviteBodySchema = z.object({
  capabilities: z.array(z.string().min(1)).min(1),
});
export type MemberInviteBody = z.infer<typeof MemberInviteBodySchema>;

export const MemberUpdateBodySchema = z.object({
  capabilities: z.array(z.string().min(1)).min(1),
});
export type MemberUpdateBody = z.infer<typeof MemberUpdateBodySchema>;

export const InviteAcceptBodySchema = z.object({
  code: z.string().min(1),
  login: z.string().min(1),
  password: z.string().min(1),
});
export type InviteAcceptBody = z.infer<typeof InviteAcceptBodySchema>;
