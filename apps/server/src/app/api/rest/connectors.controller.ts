import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@harnesys/brix';
import type {
  AddConnectorAgentBody,
  ConnectConnectorBindingBody,
  IssuePairCodeResponse,
  ListConnectorsResponse,
  PatchTelegramPolicyBody,
  TelegramConnectorActionResponse,
  UnpairTelegramConnectorResponse,
  UpsertTelegramConnectorBody,
  UpsertTelegramConnectorResponse,
} from '@harnesys/contracts';
import {
  AddConnectorAgentBodySchema,
  ConnectConnectorBindingBodySchema,
  PatchTelegramPolicyBodySchema,
  UpsertTelegramConnectorBodySchema,
} from '@harnesys/contracts';
import { AddConnectorAgentUseCase } from '../../application/connectors/add-connector-agent.use-case.ts';
import { ConnectConnectorBindingUseCase } from '../../application/connectors/connect-connector-binding.use-case.ts';
import { DisconnectConnectorBindingUseCase } from '../../application/connectors/disconnect-connector-binding.use-case.ts';
import { ListConnectorsUseCase } from '../../application/connectors/list-connectors.use-case.ts';
import { RemoveConnectorAgentUseCase } from '../../application/connectors/remove-connector-agent.use-case.ts';
import {
  IssuePairCodeUseCase,
  PatchTelegramPolicyUseCase,
  PauseTelegramConnectorUseCase,
  RemoveTelegramConnectorUseCase,
  ResumeTelegramConnectorUseCase,
  UnpairTelegramConnectorUseCase,
} from '../../application/connectors/telegram-connector-actions.use-case.ts';
import { UpsertTelegramConnectorUseCase } from '../../application/connectors/upsert-telegram-connector.use-case.ts';

@Controller('orgs/:orgId/agents/:agentId/connectors')
export class ConnectorsController {
  constructor(
    private readonly listConnectors: ListConnectorsUseCase,
    private readonly upsertTelegram: UpsertTelegramConnectorUseCase,
    private readonly issuePairCode: IssuePairCodeUseCase,
    private readonly pauseTelegram: PauseTelegramConnectorUseCase,
    private readonly resumeTelegram: ResumeTelegramConnectorUseCase,
    private readonly unpairTelegram: UnpairTelegramConnectorUseCase,
    private readonly patchPolicy: PatchTelegramPolicyUseCase,
    private readonly removeTelegram: RemoveTelegramConnectorUseCase,
    private readonly addAgent: AddConnectorAgentUseCase,
    private readonly removeAgent: RemoveConnectorAgentUseCase,
    private readonly connectBinding: ConnectConnectorBindingUseCase,
    private readonly disconnectBinding: DisconnectConnectorBindingUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string, @Param('agentId') agentId: string): ListConnectorsResponse {
    return this.listConnectors.execute({ orgId, agentId });
  }

  @Put('telegram')
  upsert(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Body(UpsertTelegramConnectorBodySchema) body: UpsertTelegramConnectorBody,
  ): Promise<UpsertTelegramConnectorResponse> {
    return this.upsertTelegram.execute({ orgId, agentId, token: body.token });
  }

  @Post('telegram/pair-code')
  pairCode(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
  ): IssuePairCodeResponse {
    return this.issuePairCode.execute({ orgId, agentId });
  }

  @Post('telegram/pause')
  pause(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
  ): TelegramConnectorActionResponse {
    return this.pauseTelegram.execute({ orgId, agentId });
  }

  @Post('telegram/resume')
  resume(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
  ): TelegramConnectorActionResponse {
    return this.resumeTelegram.execute({ orgId, agentId });
  }

  @Post('telegram/unpair')
  unpair(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
  ): UnpairTelegramConnectorResponse {
    return this.unpairTelegram.execute({ orgId, agentId });
  }

  @Patch('telegram/policy')
  policy(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Body(PatchTelegramPolicyBodySchema) body: PatchTelegramPolicyBody,
  ): TelegramConnectorActionResponse {
    return this.patchPolicy.execute({ orgId, agentId, body });
  }

  @Post('telegram/agents')
  addConnectorAgent(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Body(AddConnectorAgentBodySchema) body: AddConnectorAgentBody,
  ): TelegramConnectorActionResponse {
    return this.addAgent.execute({ orgId, agentId, body });
  }

  @Delete('telegram/agents/:memberAgentId')
  removeConnectorAgent(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('memberAgentId') memberAgentId: string,
  ): TelegramConnectorActionResponse {
    return this.removeAgent.execute({ orgId, agentId, body: { agentId: memberAgentId } });
  }

  @Post('telegram/bindings/:bindingId/connect')
  connect(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('bindingId') bindingId: string,
    @Body(ConnectConnectorBindingBodySchema) body: ConnectConnectorBindingBody,
  ): Promise<TelegramConnectorActionResponse> {
    return this.connectBinding.execute({ orgId, agentId, bindingId, body });
  }

  @Delete('telegram/bindings/:bindingId/connect')
  disconnect(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('bindingId') bindingId: string,
  ): TelegramConnectorActionResponse {
    return this.disconnectBinding.execute({ orgId, agentId, bindingId });
  }

  @Delete('telegram')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('agentId') agentId: string): Promise<void> {
    return this.removeTelegram.execute({ orgId, agentId });
  }
}
