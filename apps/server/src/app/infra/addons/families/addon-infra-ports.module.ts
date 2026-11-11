import { Module } from '@harnesys/brix';
import { AddonMigrationsPort } from '../../../application/addons/addon-migrations.port.ts';
import { AddonReasonsToLivePort } from '../../../application/addons/reconcile/reasons-to-live.port.ts';
import { AddonTransportSessionRepositoryPort } from '../../../domain/addons/ports/transport-session-repository.port.ts';
import { AddonTransportSessionRepositoryAdapter } from '../../org-sqlite/addon-transport-session-repository.adapter.ts';
import { AddonMigrationsAdapter } from './addon-migrations.adapter.ts';
import { WiredReasonsToLiveAdapter } from './reasons-to-live.adapter.ts';

/**
 * Binds application-layer addon ports to their infra implementations:
 * addon data migrations (§9.3), the shared reasons-to-live check (§8.2), and the
 * transport session journal shared by every transport addon.
 * Global so the application use-cases and the reconciler can inject them.
 */
@Module({
  global: true,
  providers: [
    AddonMigrationsAdapter,
    WiredReasonsToLiveAdapter,
    AddonTransportSessionRepositoryAdapter,
    { provide: AddonMigrationsPort, useClass: AddonMigrationsAdapter },
    { provide: AddonReasonsToLivePort, useClass: WiredReasonsToLiveAdapter },
    {
      provide: AddonTransportSessionRepositoryPort,
      useClass: AddonTransportSessionRepositoryAdapter,
    },
  ],
  exports: [AddonMigrationsPort, AddonReasonsToLivePort, AddonTransportSessionRepositoryPort],
})
export class AddonInfraPortsModule {}
