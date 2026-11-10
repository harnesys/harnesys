import { Module } from '@harnesys/brix';
import { ListAutomationKindsUseCase } from './list-automation-kinds.use-case.ts';
import { ListAutomationsUseCase } from './list-automations.use-case.ts';

const useCases = [ListAutomationsUseCase, ListAutomationKindsUseCase];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class AutomationUseCaseModule {}
