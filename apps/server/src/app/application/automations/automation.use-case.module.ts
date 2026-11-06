import { Module } from '@harnesys/brix';
import { IntegrationModule } from '../../infra/integrations/integration.module.ts';
import { ListAutomationKindsUseCase } from './list-automation-kinds.use-case.ts';
import { ListAutomationsUseCase } from './list-automations.use-case.ts';

const useCases = [ListAutomationsUseCase, ListAutomationKindsUseCase];

@Module({
  imports: [IntegrationModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class AutomationUseCaseModule {}
