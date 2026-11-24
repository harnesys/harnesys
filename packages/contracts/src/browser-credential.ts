import { z } from 'zod';

export const BrowserCredentialStatusSchema = z.enum(['unverified', 'ok', 'failing', 'locked']);
export type BrowserCredentialStatus = z.infer<typeof BrowserCredentialStatusSchema>;

const HttpsUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'loginUrl must be https');

const SelectorSchema = z.string().trim().min(1);

export const BrowserCredentialSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  name: z.string().min(1),
  loginUrl: HttpsUrlSchema,
  username: z.string(),
  usernameSelector: SelectorSchema,
  passwordSelector: SelectorSchema,
  submitSelector: SelectorSchema,
  successUrlPathPrefix: z.string().default('/'),
  successCookieName: z.string().min(1).nullable(),
  successSelector: z.string().min(1).nullable(),
  challengeCodeSelector: z.string().min(1).nullable(),
  challengeSubmitSelector: z.string().min(1).nullable(),
  egressHosts: z.array(z.string().min(1)).min(1),
  status: BrowserCredentialStatusSchema,
  failureCount: z.number().int().nonnegative(),
  lockedUntil: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type BrowserCredential = z.infer<typeof BrowserCredentialSchema>;

const CredentialSelectorsSchema = z.object({
  usernameSelector: SelectorSchema,
  passwordSelector: SelectorSchema,
  submitSelector: SelectorSchema,
});

export const PutBrowserCredentialBodySchema = CredentialSelectorsSchema.extend({
  name: z.string().trim().min(1),
  loginUrl: HttpsUrlSchema,
  username: z.string().trim(),
  successUrlPathPrefix: z.string().default('/'),
  successCookieName: z.string().min(1).nullable().optional(),
  successSelector: z.string().min(1).nullable().optional(),
  challengeCodeSelector: z.string().min(1).nullable().optional(),
  challengeSubmitSelector: z.string().min(1).nullable().optional(),
  egressHosts: z.array(z.string().trim().min(1)).default([]),
  password: z.string().min(1).optional(),
}).refine((value) => Boolean(value.successCookieName) || Boolean(value.successSelector), {
  message: 'set a success cookie name or a success selector so the login can be verified',
});
export type PutBrowserCredentialBody = z.infer<typeof PutBrowserCredentialBodySchema>;

export const BrowserCredentialListResponseSchema = z.object({
  items: z.array(BrowserCredentialSchema),
});
export type BrowserCredentialListResponse = z.infer<typeof BrowserCredentialListResponseSchema>;

export const BrowserLoginAttemptRefSchema = z.object({
  attemptId: z.string().min(1),
  kind: z.enum(['challenge', 'manual']),
  expiresAt: z.string().min(1),
});
export type BrowserLoginAttemptRef = z.infer<typeof BrowserLoginAttemptRefSchema>;

export const BrowserLoginAttemptStateSchema = z.object({
  attempt: BrowserLoginAttemptRefSchema.nullable(),
});
export type BrowserLoginAttemptState = z.infer<typeof BrowserLoginAttemptStateSchema>;

export const SubmitBrowserLoginAttemptInputSchema = z
  .object({
    code: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    cookies: z.string().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.code?.trim()) ||
      Boolean(value.cookies?.trim()) ||
      Boolean(value.username?.trim() && value.password),
    { message: 'provide a code, username and password, or cookies' },
  );
export type SubmitBrowserLoginAttemptInput = z.infer<typeof SubmitBrowserLoginAttemptInputSchema>;
