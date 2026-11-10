import { Module } from '@harnesys/brix';
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
  providers: [...useCases],
  exports: [...useCases],
})
export class AgentUseCaseModule {}
