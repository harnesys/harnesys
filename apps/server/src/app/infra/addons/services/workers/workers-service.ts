import { Injectable } from '@harnesys/brix';
import type { HostMethodSpec, HostServiceModule } from '../../../../domain/addons/host-service.ts';
import { AddonWorkerLeasePort } from '../../../../domain/addons/ports/worker-lease.port.ts';
import { serviceMethod } from '../method.ts';
import { WorkerReportSink } from '../sinks.ts';

const DEFAULT_LEASE_TTL_MS = 60_000;

@Injectable()
export class WorkersHostService implements HostServiceModule {
  readonly namespace = 'workers';
  readonly methods: readonly HostMethodSpec[];

  constructor(
    private readonly sink: WorkerReportSink,
    private readonly leases: AddonWorkerLeasePort,
  ) {
    this.methods = [
      serviceMethod('workers.report', { timeoutMs: 5000 }, (ctx, params) =>
        this.sink
          .report(ctx, {
            workerId: params.workerId,
            state: params.state,
            code: params.code,
          })
          .then(() => ({})),
      ),
      serviceMethod('workers.lease', { timeoutMs: 5000 }, async (ctx, params) => {
        const state = this.leases.claim({
          orgId: ctx.orgId,
          addonId: ctx.addonId,
          workerId: params.workerId,
          holderId: ctx.instanceId,
          ttlMs: params.ttlMs ?? DEFAULT_LEASE_TTL_MS,
          nowMs: ctx.now(),
        });
        return { held: state.held, epoch: state.epoch, expiresAt: state.expiresAt };
      }),
      serviceMethod('workers.release', { timeoutMs: 5000 }, async (ctx, params) => {
        this.leases.release({
          orgId: ctx.orgId,
          addonId: ctx.addonId,
          workerId: params.workerId,
          holderId: ctx.instanceId,
        });
        return {};
      }),
    ];
  }
}
