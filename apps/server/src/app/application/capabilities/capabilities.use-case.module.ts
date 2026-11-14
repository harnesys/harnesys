import { Module } from '@harnesys/brix';
import { ListAgentCapabilitiesUseCase } from './list-agent-capabilities.use-case.ts';
import { ListOrgCapabilitiesUseCase } from './list-org-capabilities.use-case.ts';
import { ListOrgToolsUseCase } from './list-org-tools.use-case.ts';

const useCases = [ListOrgCapabilitiesUseCase, ListOrgToolsUseCase, ListAgentCapabilitiesUseCase];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class CapabilitiesUseCaseModule {}
