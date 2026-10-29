import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { ApprovalModule } from '../../infra/approvals/approval.module.ts';
import { ExecutionProfileModule } from '../../infra/execution-profile/execution-profile.module.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { ScheduleModule } from '../../infra/schedules/schedule.module.ts';
import { SkillsModule } from '../../infra/skills/skills.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { ThreadModule } from '../../infra/thread/thread.module.ts';
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
  imports: [
    ScheduleModule,
    ThreadModule,
    AgentModule,
    SkillsModule,
    ThreadUseCaseModule,
    MachineHomeModule,
    FleetHubModule,
    SourceModule,
    ExecutionProfileModule,
    ApprovalModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ScheduleUseCaseModule {}
