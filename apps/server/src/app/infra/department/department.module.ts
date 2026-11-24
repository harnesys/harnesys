import { Module } from '@harnesys/brix';
import { DepartmentRegistryPort } from '../../domain/department/department-registry.port.ts';
import { DeskModule } from '../desk/desk.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { DepartmentRegistryAdapter } from './department-registry.adapter.ts';

@Module({
  global: true,
  imports: [MachineHomeModule, DeskModule],
  providers: [{ provide: DepartmentRegistryPort, useClass: DepartmentRegistryAdapter }],
  exports: [DepartmentRegistryPort],
})
export class DepartmentModule {}
