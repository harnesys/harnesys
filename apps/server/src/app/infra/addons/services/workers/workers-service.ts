import { Injectable } from '@harnesys/brix';
import type { HostMethodSpec, HostServiceModule } from '../../../../domain/addons/host-service.ts';
import { serviceMethod } from '../method.ts';
import { WorkerReportSink } from '../sinks.ts';

@Injectable()
export class WorkersHostService implements HostServiceModule {
  readonly namespace = 'workers';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly sink: WorkerReportSink) {
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
    ];
  }
}
