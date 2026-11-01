import { z } from 'zod';

export const EULA_CURRENT_AGREEMENT = {
  id: 'harnesys-eula-1.0.0',
  version: '1.0.0',
  publishedAt: '2026-11-01',
} as const;

export const EulaAgreementSchema = z.object({
  id: z.string(),
  version: z.string(),
  publishedAt: z.string(),
});
export type EulaAgreement = z.infer<typeof EulaAgreementSchema>;

export const EulaConsentSchema = z.object({
  agreementId: z.string(),
  acceptedAt: z.string(),
});
export type EulaConsent = z.infer<typeof EulaConsentSchema>;

export const EulaStatusSchema = z.object({
  agreement: EulaAgreementSchema,
  consent: EulaConsentSchema.nullable(),
});
export type EulaStatus = z.infer<typeof EulaStatusSchema>;

export const EulaAcceptBodySchema = z.object({
  agreementId: z.string().min(1),
});
export type EulaAcceptBody = z.infer<typeof EulaAcceptBodySchema>;
