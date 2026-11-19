import {
  admitQuota,
  emptyQuotaState,
  type QuotaState,
  settleQuota,
} from '../domain/model-quota.ts';
import type { ModelQuotaPort, QuotaAdmission } from '../ports/model-quota.ts';
import type { ModelRateLimits } from '../ports/models.ts';

export class InMemoryModelQuota implements ModelQuotaPort {
  private readonly state: QuotaState = emptyQuotaState();
  private seq = 0;

  admit(key: string, limits: ModelRateLimits, estTokens: number): QuotaAdmission {
    this.seq += 1;
    return admitQuota(
      {
        state: this.state,
        key,
        limits,
        estTokens,
        reservationId: `quota-${this.seq}`,
      },
      Date.now(),
    );
  }

  settle(key: string, reservation: string, actualTokens: number | undefined): void {
    settleQuota(this.state, key, reservation, actualTokens, Date.now());
  }
}
