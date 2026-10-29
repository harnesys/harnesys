import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { IssueInfraModule } from '../../infra/issues/issue.module.ts';
import { PresetsModule } from '../../infra/presets/presets.module.ts';
import { ProviderModule } from '../../infra/provider/provider.module.ts';
import { SkillsModule } from '../../infra/skills/skills.module.ts';
import { AgentUseCaseModule } from '../agents/agent.use-case.module.ts';
import { IssueUseCaseModule } from '../issues/issue.use-case.module.ts';
import { ScheduleUseCaseModule } from '../schedules/schedule.use-case.module.ts';
import { CreateTeamFromPresetUseCase } from './create-team-from-preset.use-case.ts';

const useCases = [CreateTeamFromPresetUseCase];

@Module({
  imports: [
    AgentModule,
    ProviderModule,
    IssueInfraModule,
    AgentUseCaseModule,
    IssueUseCaseModule,
    ScheduleUseCaseModule,
    PresetsModule,
    SkillsModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class TeamsUseCaseModule {}
