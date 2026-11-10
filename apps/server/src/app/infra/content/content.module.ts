import { Module } from '@harnesys/brix';
import { HostBrowsePort } from '../../domain/content/host-browse.port.ts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';
import { FleetHubModule } from '../fleet-hub/fleet-hub.module.ts';
import { FleetWorkerModule } from '../fleet-hub/fleet-worker.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SourceModule } from '../source/source.module.ts';
import { HostBrowseAdapter } from './host-browse.adapter.ts';
import { LocalFsContentAdapter } from './local-fs.adapter.ts';
import { RoutingContentAdapter } from './routing-content.adapter.ts';

@Module({
  global: true,
  imports: [MachineHomeModule, SourceModule, FleetHubModule, FleetWorkerModule],
  providers: [
    LocalFsContentAdapter,
    { provide: OrgContentPort, useClass: RoutingContentAdapter },
    { provide: HostBrowsePort, useClass: HostBrowseAdapter },
  ],
  exports: [OrgContentPort, HostBrowsePort],
})
export class ContentModule {}
