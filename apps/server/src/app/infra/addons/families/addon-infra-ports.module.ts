import { Module } from '@harnesys/brix';
import { AddonMigrationsPort } from '../../../application/addons/addon-migrations.port.ts';
import { AddonReasonsToLivePort } from '../../../application/addons/reconcile/reasons-to-live.port.ts';
import { AddonMigrationsAdapter } from './addon-migrations.adapter.ts';
import { WiredReasonsToLiveAdapter } from './reasons-to-live.adapter.ts';

/**
 * Binds application-layer addon ports to their infra implementations:
 * addon data migrations (§9.3) and the shared reasons-to-live check (§8.2).
 * Global so the application use-cases and the reconciler can inject them.
 */
@Module({
  global: true,
  providers: [
    AddonMigrationsAdapter,
    WiredReasonsToLiveAdapter,
    { provide: AddonMigrationsPort, useClass: AddonMigrationsAdapter },
    { provide: AddonReasonsToLivePort, useClass: WiredReasonsToLiveAdapter },
  ],
  exports: [AddonMigrationsPort, AddonReasonsToLivePort],
})
export class AddonInfraPortsModule {}
