import { Module } from '@harnesys/brix';
import { AgentUseCaseModule } from '../agents/agent.use-case.module.ts';
import { IssueUseCaseModule } from '../issues/issue.use-case.module.ts';
import { ScheduleUseCaseModule } from '../schedules/schedule.use-case.module.ts';
import { CreateTeamFromPresetUseCase } from './create-team-from-preset.use-case.ts';

const useCases = [CreateTeamFromPresetUseCase];

@Module({
  imports: [AgentUseCaseModule, IssueUseCaseModule, ScheduleUseCaseModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class TeamsUseCaseModule {}
