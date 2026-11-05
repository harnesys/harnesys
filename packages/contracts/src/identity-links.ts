import { z } from 'zod';

export const IDENTITY_LINK_CODE_TTL_MS = 10 * 60 * 1000;

export const IdentityProviderSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,31}$/, { message: 'invalid provider id' });
export type IdentityProvider = z.infer<typeof IdentityProviderSchema>;

export const IdentityLinkSchema = z.object({
  provider: z.string(),
  providerUserId: z.string(),
  displayName: z.string().nullable(),
  handle: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IdentityLink = z.infer<typeof IdentityLinkSchema>;

export const ListIdentityLinksResponseSchema = z.object({
  links: z.array(IdentityLinkSchema),
});
export type ListIdentityLinksResponse = z.infer<typeof ListIdentityLinksResponseSchema>;

export const IssueIdentityLinkCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
});
export type IssueIdentityLinkCodeResponse = z.infer<typeof IssueIdentityLinkCodeResponseSchema>;
