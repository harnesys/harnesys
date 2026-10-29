import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@harnesys/brix';
import type {
  IssuePairCodeResponse,
  ListConnectorsResponse,
  PatchTelegramPolicyBody,
  TelegramConnectorActionResponse,
  UnpairTelegramConnectorResponse,
  UpsertTelegramConnectorBody,
  UpsertTelegramConnectorResponse,
} from '@harnesys/contracts';
import {
  PatchTelegramPolicyBodySchema,
  UpsertTelegramConnectorBodySchema,
} from '@harnesys/contracts';
import { ListConnectorsUseCase } from '../../application/connectors/list-connectors.use-case.ts';
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

  @Delete('telegram')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('agentId') agentId: string): Promise<void> {
    return this.removeTelegram.execute({ orgId, agentId });
  }
}
