import { Module } from '@harnesys/brix';
import { AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { AppKindRegistryAdapter } from './app-kind.adapter.ts';
import { AppRegistryAdapter } from './app-registry.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: AppRegistryPort, useClass: AppRegistryAdapter },
    { provide: AppKindRegistryPort, useClass: AppKindRegistryAdapter },
  ],
  exports: [AppRegistryPort, AppKindRegistryPort],
})
export class AppsModule {}
