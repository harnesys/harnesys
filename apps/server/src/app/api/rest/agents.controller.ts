import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@harnesys/brix';
import type {
  AgentCapabilitiesView,
  AgentPublic,
  CreateAgentBody,
  CreateAgentFromPresetBody,
  ListAgentsResponse,
  UpdateAgentBody,
} from '@harnesys/contracts';
import {
  CreateAgentBodySchema,
  CreateAgentFromPresetBodySchema,
  UpdateAgentBodySchema,
} from '@harnesys/contracts';
import { CreateAgentUseCase } from '../../application/agents/create-agent.use-case.ts';
import { CreateAgentFromPresetUseCase } from '../../application/agents/create-agent-from-preset.use-case.ts';
import { DeleteAgentUseCase } from '../../application/agents/delete-agent.use-case.ts';
import { GetAgentUseCase } from '../../application/agents/get-agent.use-case.ts';
import { ListAgentsUseCase } from '../../application/agents/list-agents.use-case.ts';
import { UpdateAgentUseCase } from '../../application/agents/update-agent.use-case.ts';
import { ListAgentCapabilitiesUseCase } from '../../application/capabilities/list-agent-capabilities.use-case.ts';

@Controller('orgs/:orgId/agents')
export class AgentsController {
  constructor(
    private readonly listAgents: ListAgentsUseCase,
    private readonly getAgent: GetAgentUseCase,
    private readonly createAgent: CreateAgentUseCase,
    private readonly updateAgent: UpdateAgentUseCase,
    private readonly deleteAgent: DeleteAgentUseCase,
    private readonly createFromPreset: CreateAgentFromPresetUseCase,
    private readonly listCapabilities: ListAgentCapabilitiesUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListAgentsResponse {
    return this.listAgents.execute({ orgId });
  }

  @Get(':agentId')
  get(@Param('orgId') orgId: string, @Param('agentId') agentId: string): AgentPublic {
    return this.getAgent.execute({ orgId, agentId });
  }

  @Get(':agentId/capabilities')
  capabilities(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
  ): Promise<AgentCapabilitiesView> {
    return this.listCapabilities.execute({ orgId, agentId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateAgentBodySchema) body: CreateAgentBody,
  ): AgentPublic {
    return this.createAgent.execute({ orgId, body });
  }

  @Post('from-preset')
  @HttpCode(201)
  fromPreset(
    @Param('orgId') orgId: string,
    @Body(CreateAgentFromPresetBodySchema) body: CreateAgentFromPresetBody,
  ): AgentPublic {
    return this.createFromPreset.execute({ orgId, body });
  }

  @Patch(':agentId')
  update(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Body(UpdateAgentBodySchema) body: UpdateAgentBody,
  ): AgentPublic {
    return this.updateAgent.execute({ orgId, agentId, body });
  }

  @Delete(':agentId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('agentId') agentId: string): Promise<void> {
    return this.deleteAgent.execute({ orgId, agentId });
  }
}
