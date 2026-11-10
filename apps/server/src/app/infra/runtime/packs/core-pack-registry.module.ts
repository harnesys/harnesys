import { Module } from '@harnesys/brix';
import { PackRegistryPort } from '../../../domain/capabilities/pack-registry.port.ts';
import { CorePackRegistryAdapter } from './core-pack-registry.adapter.ts';

@Module({
  providers: [{ provide: PackRegistryPort, useClass: CorePackRegistryAdapter }],
  exports: [PackRegistryPort],
})
export class CorePackRegistryModule {}
