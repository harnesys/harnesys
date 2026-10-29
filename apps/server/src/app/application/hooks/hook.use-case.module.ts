import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { HookRunModule } from '../../infra/agent/hook-run.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { ProviderModule } from '../../infra/provider/provider.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { ListHookRunsUseCase } from './list-hook-runs.use-case.ts';
import { TestAgentHookUseCase } from './test-agent-hook.use-case.ts';

const useCases = [ListHookRunsUseCase, TestAgentHookUseCase];

@Module({
  imports: [
    AgentModule,
    HookRunModule,
    ProviderModule,
    SecretModule,
    MachineHomeModule,
    SourceModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class HookUseCaseModule {}
