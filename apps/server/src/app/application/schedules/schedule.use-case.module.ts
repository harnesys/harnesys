import { Module } from '@harnesys/brix';
import { ThreadUseCaseModule } from '../threads/thread.use-case.module.ts';
import { CreateScheduleUseCase } from './create-schedule.use-case.ts';
import { DeleteScheduleUseCase } from './delete-schedule.use-case.ts';
import { FireScheduleUseCase } from './fire-schedule.use-case.ts';
import { ListSchedulesUseCase } from './list-schedules.use-case.ts';
import { TickSchedulesUseCase } from './tick-schedules.use-case.ts';
import { UpdateScheduleUseCase } from './update-schedule.use-case.ts';

const useCases = [
  ListSchedulesUseCase,
  CreateScheduleUseCase,
  UpdateScheduleUseCase,
  DeleteScheduleUseCase,
  FireScheduleUseCase,
  TickSchedulesUseCase,
];

@Module({
  imports: [ThreadUseCaseModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ScheduleUseCaseModule {}
