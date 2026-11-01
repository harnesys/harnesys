import { Module } from '@harnesys/brix';
import { EulaPort } from '../../domain/eula/eula.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { EulaAdapter } from './eula.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: EulaPort, useClass: EulaAdapter }],
  exports: [EulaPort],
})
export class EulaInfraModule {}
