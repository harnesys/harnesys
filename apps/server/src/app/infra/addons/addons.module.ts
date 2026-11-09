import { Module } from '@harnesys/brix';
import { AddonCatalogPort } from '../../domain/addons/addon-catalog.port.ts';
import { AddonHostPort } from '../../domain/addons/addon-host.port.ts';
import { EventsWatchModule } from '../events-watch/events-watch.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { AddonCatalogAdapter } from './addon-catalog.adapter.ts';
import { AddonDiscovery } from './addon-discovery.ts';
import { AddonHost } from './addon-host.ts';

@Module({
  imports: [MachineHomeModule, EventsWatchModule],
  providers: [
    AddonDiscovery,
    { provide: AddonCatalogPort, useClass: AddonCatalogAdapter },
    { provide: AddonHostPort, useClass: AddonHost },
  ],
  exports: [AddonHostPort, AddonDiscovery],
})
export class AddonsModule {}
