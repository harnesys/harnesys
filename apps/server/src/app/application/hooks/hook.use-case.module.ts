import { Module } from '@harnesys/brix';
import { ListHookRunsUseCase } from './list-hook-runs.use-case.ts';
import { TestAgentHookUseCase } from './test-agent-hook.use-case.ts';

const useCases = [ListHookRunsUseCase, TestAgentHookUseCase];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class HookUseCaseModule {}
