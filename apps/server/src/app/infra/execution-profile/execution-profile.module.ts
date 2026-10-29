import { Module } from '@harnesys/brix';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ExecutionProfileAdapter } from './execution-profile.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: ExecutionProfilePort, useClass: ExecutionProfileAdapter }],
  exports: [ExecutionProfilePort],
})
export class ExecutionProfileModule {}
