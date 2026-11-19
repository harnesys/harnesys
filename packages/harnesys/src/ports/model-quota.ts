import type { ModelRateLimits } from './models.ts';

export const QUOTA_BUCKETS = ['rpm', 'rpd', 'tpm', 'tpd'] as const;
export type QuotaBucket = (typeof QUOTA_BUCKETS)[number];

export interface QuotaAdmission {
  granted: boolean;
  reservation?: string;
  waitMs?: number;
  reason?: QuotaBucket;
}

export interface ModelQuotaPort {
  admit(key: string, limits: ModelRateLimits, estTokens: number): QuotaAdmission;
  settle(key: string, reservation: string, actualTokens: number | undefined): void;
}
