import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { ApprovalModule } from '../../infra/approvals/approval.module.ts';
import { IssueInfraModule } from '../../infra/issues/issue.module.ts';
import { ManagerInfraModule } from '../../infra/manager/manager.module.ts';
import { SkillsModule } from '../../infra/skills/skills.module.ts';
import { ThreadModule } from '../../infra/thread/thread.module.ts';
import { UsageModule } from '../../infra/usage/usage.module.ts';
import { ManagerToolsProvider } from './manager-tools.provider.ts';

@Module({
  imports: [
    AgentModule,
    ApprovalModule,
    IssueInfraModule,
    ManagerInfraModule,
    SkillsModule,
    ThreadModule,
    UsageModule,
  ],
  providers: [ManagerToolsProvider],
})
export class ManagerUseCaseModule {}
