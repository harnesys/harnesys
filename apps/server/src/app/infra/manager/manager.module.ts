import { Module } from '@harnesys/brix';
import { ManagerTailPort } from '../../domain/manager/manager-tail.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ManagerTailAdapter } from '../org-sqlite/manager-tail.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: ManagerTailPort, useClass: ManagerTailAdapter }],
  exports: [ManagerTailPort],
})
export class ManagerInfraModule {}
