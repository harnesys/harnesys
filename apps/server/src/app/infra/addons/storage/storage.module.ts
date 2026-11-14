import { Module } from '@harnesys/brix';
import { MachineHomeModule } from '../../machine-home/machine-home.module.ts';
import { SecretModule } from '../../secret/secret.module.ts';
import { AddonSecretService } from './addon-secret.service.ts';

@Module({
  imports: [MachineHomeModule, SecretModule],
  providers: [AddonSecretService],
  exports: [AddonSecretService],
})
export class AddonStorageModule {}
