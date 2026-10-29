import { Module } from '@harnesys/brix';
import { UsagePort } from '../../domain/usage/usage-port.ts';
import { IdentitySqliteModule } from '../identity-sqlite/identity-sqlite.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { UsageAdapter } from './usage.adapter.ts';

@Module({
  imports: [MachineHomeModule, IdentitySqliteModule],
  providers: [
    {
      provide: UsagePort,
      useClass: UsageAdapter,
    },
  ],
  exports: [UsagePort],
})
export class UsageModule {}
