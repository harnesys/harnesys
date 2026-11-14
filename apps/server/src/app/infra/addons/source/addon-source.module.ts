import { Module } from '@harnesys/brix';
import { AddonsApplicationModule } from '../../../application/addons/addons-application.module.ts';
import { AddonCloudBackendPort } from '../../../domain/addons/ports/addon-cloud-backend.port.ts';
import { AddonSourceKindsPort } from '../../../domain/addons/ports/addon-source-kinds.port.ts';
import { AddonFamiliesModule } from '../families/families.module.ts';
import { AddonCloudBackendAdapter, AddonSourceKindsAdapter } from './addon-source.adapters.ts';

/**
 * Add-on knowledge-source platform surface: exposes registered `source-kind`
 * contributions to the application layer and creates remote `CloudRemoteBackendPort`
 * proxies that execute against add-on `source.*` handlers.
 */
@Module({
  global: true,
  imports: [AddonFamiliesModule, AddonsApplicationModule],
  providers: [
    { provide: AddonSourceKindsPort, useClass: AddonSourceKindsAdapter },
    { provide: AddonCloudBackendPort, useClass: AddonCloudBackendAdapter },
  ],
  exports: [AddonSourceKindsPort, AddonCloudBackendPort],
})
export class AddonSourceModule {}
