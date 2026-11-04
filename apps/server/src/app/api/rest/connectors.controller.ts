import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@harnesys/brix';
import type {
  AttachChatBody,
  AttachChatResponse,
  ConnectChatBody,
  ConnectChatResponse,
  CreateTopicBody,
  CreateTopicResponse,
  IssuePairCodeResponse,
  ListConnectorsQuery,
  ListConnectorsResponse,
  PatchTelegramPolicyBody,
  TelegramConnectorActionResponse,
  UnpairTelegramConnectorResponse,
  UpsertTelegramConnectorBody,
  UpsertTelegramConnectorResponse,
} from '@harnesys/contracts';
import {
  AttachChatBodySchema,
  ConnectChatBodySchema,
  CreateTopicBodySchema,
  ListConnectorsQuerySchema,
  PatchTelegramPolicyBodySchema,
  UpsertTelegramConnectorBodySchema,
} from '@harnesys/contracts';
import { AttachChatUseCase } from '../../application/connectors/attach-chat.use-case.ts';
import { ConnectChatUseCase } from '../../application/connectors/connect-chat.use-case.ts';
import { CreateTopicUseCase } from '../../application/connectors/create-topic.use-case.ts';
import { DisconnectChatUseCase } from '../../application/connectors/disconnect-chat.use-case.ts';
import { ForgetChatUseCase } from '../../application/connectors/forget-chat.use-case.ts';
import {
  GetConnectorUseCase,
  ListConnectorsUseCase,
} from '../../application/connectors/list-connectors.use-case.ts';
import {
  IssuePairCodeUseCase,
  PatchTelegramPolicyUseCase,
  PauseTelegramConnectorUseCase,
  RemoveTelegramConnectorUseCase,
  ResumeTelegramConnectorUseCase,
  UnpairTelegramConnectorUseCase,
} from '../../application/connectors/telegram-connector-actions.use-case.ts';
import { UpsertTelegramConnectorUseCase } from '../../application/connectors/upsert-telegram-connector.use-case.ts';

@Controller('orgs/:orgId/connectors')
export class ConnectorsController {
  constructor(
    private readonly listConnectors: ListConnectorsUseCase,
    private readonly getConnector: GetConnectorUseCase,
    private readonly upsertTelegram: UpsertTelegramConnectorUseCase,
    private readonly issuePairCode: IssuePairCodeUseCase,
    private readonly pauseTelegram: PauseTelegramConnectorUseCase,
    private readonly resumeTelegram: ResumeTelegramConnectorUseCase,
    private readonly unpairTelegram: UnpairTelegramConnectorUseCase,
    private readonly patchPolicy: PatchTelegramPolicyUseCase,
    private readonly removeTelegram: RemoveTelegramConnectorUseCase,
    private readonly attachChat: AttachChatUseCase,
    private readonly connectChat: ConnectChatUseCase,
    private readonly disconnectChat: DisconnectChatUseCase,
    private readonly createTopic: CreateTopicUseCase,
    private readonly forgetChat: ForgetChatUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(ListConnectorsQuerySchema) query: ListConnectorsQuery,
  ): ListConnectorsResponse {
    return this.listConnectors.execute({ orgId, ...query });
  }

  @Get(':connectorId')
  get(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
  ): TelegramConnectorActionResponse {
    return this.getConnector.execute({ orgId, connectorId });
  }

  @Post('telegram')
  create(
    @Param('orgId') orgId: string,
    @Body(UpsertTelegramConnectorBodySchema) body: UpsertTelegramConnectorBody,
  ): Promise<UpsertTelegramConnectorResponse> {
    return this.upsertTelegram.execute({ orgId, token: body.token });
  }

  @Put(':connectorId/telegram')
  update(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
    @Body(UpsertTelegramConnectorBodySchema) body: UpsertTelegramConnectorBody,
  ): Promise<UpsertTelegramConnectorResponse> {
    return this.upsertTelegram.execute({ orgId, connectorId, token: body.token });
  }

  @Delete(':connectorId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('connectorId') connectorId: string): Promise<void> {
    return this.removeTelegram.execute({ orgId, connectorId });
  }

  @Post(':connectorId/telegram/pair-code')
  pairCode(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
  ): IssuePairCodeResponse {
    return this.issuePairCode.execute({ orgId, connectorId });
  }

  @Post(':connectorId/telegram/pause')
  pause(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
  ): TelegramConnectorActionResponse {
    return this.pauseTelegram.execute({ orgId, connectorId });
  }

  @Post(':connectorId/telegram/resume')
  resume(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
  ): TelegramConnectorActionResponse {
    return this.resumeTelegram.execute({ orgId, connectorId });
  }

  @Post(':connectorId/telegram/unpair')
  unpair(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
  ): UnpairTelegramConnectorResponse {
    return this.unpairTelegram.execute({ orgId, connectorId });
  }

  @Patch(':connectorId/telegram/policy')
  policy(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
    @Body(PatchTelegramPolicyBodySchema) body: PatchTelegramPolicyBody,
  ): TelegramConnectorActionResponse {
    return this.patchPolicy.execute({ orgId, connectorId, body });
  }

  @Post(':connectorId/telegram/chats/attach')
  attach(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
    @Body(AttachChatBodySchema) body: AttachChatBody,
  ): Promise<AttachChatResponse> {
    return this.attachChat.execute({ orgId, connectorId, body });
  }

  @Post(':connectorId/telegram/chats/:bindingId/connect')
  connect(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
    @Param('bindingId') bindingId: string,
    @Body(ConnectChatBodySchema) body: ConnectChatBody,
  ): Promise<ConnectChatResponse> {
    return this.connectChat.execute({ orgId, connectorId, bindingId, body });
  }

  @Delete(':connectorId/telegram/chats/:bindingId/connect')
  disconnect(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
    @Param('bindingId') bindingId: string,
  ): TelegramConnectorActionResponse {
    return this.disconnectChat.execute({ orgId, connectorId, bindingId });
  }

  @Post(':connectorId/telegram/chats/:bindingId/topics')
  topic(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
    @Param('bindingId') bindingId: string,
    @Body(CreateTopicBodySchema) body: CreateTopicBody,
  ): Promise<CreateTopicResponse> {
    return this.createTopic.execute({ orgId, connectorId, bindingId, body });
  }

  @Delete(':connectorId/telegram/chats/:bindingId')
  forget(
    @Param('orgId') orgId: string,
    @Param('connectorId') connectorId: string,
    @Param('bindingId') bindingId: string,
  ): TelegramConnectorActionResponse {
    return this.forgetChat.execute({ orgId, connectorId, bindingId });
  }
}
