import { Module } from '@harnesys/brix';
import { AutomationsModule } from '../../infra/automations/automations.module.ts';
import { ListAutomationKindsUseCase } from './list-automation-kinds.use-case.ts';
import { ListAutomationsUseCase } from './list-automations.use-case.ts';

const useCases = [ListAutomationsUseCase, ListAutomationKindsUseCase];

@Module({
  imports: [AutomationsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class AutomationUseCaseModule {}
