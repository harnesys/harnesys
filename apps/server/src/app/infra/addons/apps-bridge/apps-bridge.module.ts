import { Module } from '@harnesys/brix';
import { InboundEventPort } from '../../../domain/apps/ports/inbound-event.port.ts';
import { EventsModule } from '../../events/events.module.ts';
import { AppsModule } from '../../apps/apps.module.ts';
import { AddonCatalogModule } from '../catalog/catalog.module.ts';
import { AddonFamiliesModule } from '../families/families.module.ts';
import { AddonSupervisorModule } from '../supervisor/supervisor.module.ts';
import { AccountHolderBridge } from './account-holder.bridge.ts';
import { AccountsChangedForwarder } from './accounts-changed.forwarder.ts';
import { InboundEventBridge } from './inbound-event.bridge.ts';

@Module({
  imports: [
    AddonCatalogModule,
    AddonFamiliesModule,
    AddonSupervisorModule,
    EventsModule,
    AppsModule,
  ],
  providers: [
    AccountHolderBridge,
    AccountsChangedForwarder,
    { provide: InboundEventPort, useClass: InboundEventBridge },
  ],
  exports: [AccountHolderBridge, AccountsChangedForwarder, InboundEventPort],
})
export class AddonAppsBridgeModule {}
