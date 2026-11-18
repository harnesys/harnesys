import { Module } from '@harnesys/brix';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';
import { SourceRunnerPort } from '../../domain/dashboards/source-runner.port.ts';
import { EventsWatchModule } from '../events-watch/events-watch.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { DashboardStoreAdapter } from './dashboard-store.adapter.ts';
import { DashboardsNotifierAdapter } from './dashboards-notifier.adapter.ts';
import { SourceRunnerAdapter } from './source-runner.adapter.ts';

@Module({
  global: true,
  imports: [MachineHomeModule, EventsWatchModule],
  providers: [
    { provide: DashboardStorePort, useClass: DashboardStoreAdapter },
    { provide: SourceRunnerPort, useClass: SourceRunnerAdapter },
    { provide: DashboardsNotifierPort, useClass: DashboardsNotifierAdapter },
  ],
  exports: [DashboardStorePort, SourceRunnerPort, DashboardsNotifierPort],
})
export class DashboardsInfraModule {}
