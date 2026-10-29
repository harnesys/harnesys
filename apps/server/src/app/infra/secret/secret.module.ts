import { Module } from '@harnesys/brix';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SecretStoreAdapter } from './secret-store.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: SecretStorePort, useClass: SecretStoreAdapter }],
  exports: [SecretStorePort],
})
export class SecretModule {}
