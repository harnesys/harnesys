import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { ConnectorModule } from '../../infra/connector/connector.module.ts';
import { ExecutionProfileModule } from '../../infra/execution-profile/execution-profile.module.ts';
import { ModePresetsModule } from '../../infra/mode-presets/mode-presets.module.ts';
import { PresetsModule } from '../../infra/presets/presets.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { CreateAgentUseCase } from './create-agent.use-case.ts';
import { CreateAgentFromPresetUseCase } from './create-agent-from-preset.use-case.ts';
import { DeleteAgentUseCase } from './delete-agent.use-case.ts';
import { GetAgentUseCase } from './get-agent.use-case.ts';
import { ListAgentsUseCase } from './list-agents.use-case.ts';
import { UpdateAgentUseCase } from './update-agent.use-case.ts';

const useCases = [
  ListAgentsUseCase,
  GetAgentUseCase,
  CreateAgentUseCase,
  UpdateAgentUseCase,
  DeleteAgentUseCase,
  CreateAgentFromPresetUseCase,
];

@Module({
  imports: [
    AgentModule,
    ModePresetsModule,
    ExecutionProfileModule,
    ConnectorModule,
    SecretModule,
    PresetsModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class AgentUseCaseModule {}
