import { z } from 'zod';

export const AddonErrorReasonSchema = z.enum([
  'invalid_params',
  'invalid_response',
  'permission_denied',
  'not_found',
  'conflict',
  'quota_exceeded',
  'rate_limited',
  'timeout',
  'cancelled',
  'unavailable',
  'unsupported',
  'account_failed',
  'incompatible_handlers',
  'migration_failed',
  'permission_revoked',
  'internal',
]);

export type AddonErrorReason = z.infer<typeof AddonErrorReasonSchema>;

export interface AddonErrorData {
  reason: AddonErrorReason;
  retryable: boolean;
  detail?: string;
  accountCode?: string;
}

export const AddonErrorDataSchema = z.object({
  reason: AddonErrorReasonSchema,
  retryable: z.boolean(),
  detail: z.string().optional(),
  accountCode: z.string().optional(),
});

export class AddonError extends Error {
  readonly reason: AddonErrorReason;
  readonly retryable: boolean;
  readonly detail?: string;
  readonly accountCode?: string;

  constructor(
    reason: AddonErrorReason,
    options?: { retryable?: boolean; detail?: string; accountCode?: string },
  ) {
    super(options?.detail ?? reason);
    this.name = 'AddonError';
    this.reason = reason;
    this.retryable = options?.retryable ?? false;
    this.detail = options?.detail;
    this.accountCode = options?.accountCode;
  }

  toData(): AddonErrorData {
    return {
      reason: this.reason,
      retryable: this.retryable,
      detail: this.detail,
      accountCode: this.accountCode,
    };
  }
}
