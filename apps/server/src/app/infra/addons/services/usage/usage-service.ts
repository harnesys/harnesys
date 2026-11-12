import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { UsageValidationError } from '../../../../domain/usage/usage.errors.ts';
import type { UsageSummary, UsageSummaryRequest } from '../../../../domain/usage/usage-port.ts';
import { UsagePort } from '../../../../domain/usage/usage-port.ts';
import { serviceMethod } from '../method.ts';

const USAGE_LIMITS = { timeoutMs: 10000 };

@Injectable()
export class UsageHostService implements HostServiceModule {
  readonly namespace = 'usage';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly usage: UsagePort) {
    this.methods = [
      serviceMethod('usage.summary', USAGE_LIMITS, (ctx, params) => this.summary(ctx, params)),
    ];
  }

  private async summary(ctx: HostCallContext, params: UsageSummaryRequest): Promise<UsageSummary> {
    try {
      return this.usage.summary(ctx.orgId, { threadId: params.threadId, since: params.since });
    } catch (error) {
      if (error instanceof UsageValidationError) {
        throw new AddonError('invalid_params', { detail: error.message });
      }
      throw error;
    }
  }
}
