import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { PluginsModule } from '../../infra/plugins/plugins.module.ts';
import { ListAgentCapabilitiesUseCase } from './list-agent-capabilities.use-case.ts';
import { ListOrgCapabilitiesUseCase } from './list-org-capabilities.use-case.ts';
import { ListOrgToolsUseCase } from './list-org-tools.use-case.ts';

const useCases = [ListOrgCapabilitiesUseCase, ListOrgToolsUseCase, ListAgentCapabilitiesUseCase];

@Module({
  imports: [AgentModule, PluginsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class CapabilitiesUseCaseModule {}
