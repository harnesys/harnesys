import { Module } from '@harnesys/brix';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ScheduleRepositoryAdapter } from './schedule-repository.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: ScheduleRepositoryPort, useClass: ScheduleRepositoryAdapter }],
  exports: [ScheduleRepositoryPort],
})
export class ScheduleModule {}
