import type { ModelRateLimits } from '@harnesys/studio-shared';
import { z } from 'zod';

const optionalPositiveInt = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 1),
    'Must be a positive number',
  )
  .transform((value) => (value === '' ? undefined : Math.floor(Number(value))));
export const rateLimitsSchema = z.object({
  rpm: optionalPositiveInt,
  rpd: optionalPositiveInt,
  tpm: optionalPositiveInt,
  tpd: optionalPositiveInt,
});
export type RateLimitFields = z.input<typeof rateLimitsSchema>;
export type RateLimitValues = z.output<typeof rateLimitsSchema>;
export function emptyRateLimitFields(): RateLimitFields {
  return { rpm: '', rpd: '', tpm: '', tpd: '' };
}
export function rateLimitFieldsFrom(limits: ModelRateLimits | undefined): RateLimitFields {
  if (!limits) {
    return emptyRateLimitFields();
  }
  return {
    rpm: stringify(limits.rpm),
    rpd: stringify(limits.rpd),
    tpm: stringify(limits.tpm),
    tpd: stringify(limits.tpd),
  };
}
export function toRateLimits(values: RateLimitValues): ModelRateLimits | undefined {
  const limits: ModelRateLimits = {};
  if (values.rpm !== undefined) {
    limits.rpm = values.rpm;
  }
  if (values.rpd !== undefined) {
    limits.rpd = values.rpd;
  }
  if (values.tpm !== undefined) {
    limits.tpm = values.tpm;
  }
  if (values.tpd !== undefined) {
    limits.tpd = values.tpd;
  }
  return Object.keys(limits).length > 0 ? limits : undefined;
}
function stringify(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
