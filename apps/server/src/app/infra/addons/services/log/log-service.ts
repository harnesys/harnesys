import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import type { HostMethodSpec, HostServiceModule } from '../../../../domain/addons/host-service.ts';
import { ClockPort } from '../../../../domain/apps/ports/clock.port.ts';
import { MinuteQuota } from '../../dispatcher/rate-limit.ts';
import { serviceMethod } from '../method.ts';
import type { AddonLogEntry } from '../sinks.ts';
import { LogSink } from '../sinks.ts';

const LINES_PER_MINUTE = 1000;

@Injectable()
export class LogHostService implements HostServiceModule {
  readonly namespace = 'log';
  readonly methods: readonly HostMethodSpec[];
  private readonly quota: MinuteQuota;

  constructor(
    private readonly sink: LogSink,
    clock: ClockPort,
  ) {
    this.quota = new MinuteQuota(clock);
    this.methods = [
      serviceMethod('log.write', { timeoutMs: 5000 }, async (ctx, params) => {
        this.assertQuota(ctx.orgId, ctx.addonId);
        const entry: AddonLogEntry = {
          orgId: ctx.orgId,
          addonId: ctx.addonId,
          level: params.level,
          message: params.message,
          fields: params.fields,
          at: new Date().toISOString(),
        };
        this.sink.append(entry);
        return {};
      }),
    ];
  }

  private assertQuota(orgId: string, addonId: string): void {
    if (!this.quota.tryConsume(`log:${orgId}:${addonId}`, LINES_PER_MINUTE)) {
      throw new AddonError('quota_exceeded', {
        detail: `log quota exceeded (${LINES_PER_MINUTE} lines per minute)`,
        retryable: true,
      });
    }
  }
}
