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
  ListSemanticQuery,
  MemoryRecord,
  PinRecord,
  UpdateSemanticBody,
  UpsertPinBody,
  UpsertSemanticBody,
} from '@harnesys/contracts';
import {
  ListSemanticQuerySchema,
  type MemorySettingsBody,
  MemorySettingsBodySchema,
  UpdateSemanticBodySchema,
  UpsertPinBodySchema,
  UpsertSemanticBodySchema,
} from '@harnesys/contracts';
import {
  ApprovePromotionUseCase,
  type PromotionDecisionResult,
} from '../../application/memory/approve-promotion.use-case.ts';
import { DeletePinUseCase } from '../../application/memory/delete-pin.use-case.ts';
import { DeleteSemanticUseCase } from '../../application/memory/delete-semantic.use-case.ts';
import {
  GetMemoryStatusUseCase,
  type MemoryEmbeddingsStatus,
} from '../../application/memory/get-memory-status.use-case.ts';
import { ListPinsUseCase } from '../../application/memory/list-pins.use-case.ts';
import { ListPromotionsUseCase } from '../../application/memory/list-promotions.use-case.ts';
import { ListSemanticUseCase } from '../../application/memory/list-semantic.use-case.ts';
import { RejectPromotionUseCase } from '../../application/memory/reject-promotion.use-case.ts';
import { RunMemoryPassUseCase } from '../../application/memory/run-memory-pass.use-case.ts';
import { UpdateSemanticUseCase } from '../../application/memory/update-semantic.use-case.ts';
import { UpsertMemorySettingsUseCase } from '../../application/memory/upsert-memory-settings.use-case.ts';
import { UpsertPinUseCase } from '../../application/memory/upsert-pin.use-case.ts';
import { UpsertSemanticUseCase } from '../../application/memory/upsert-semantic.use-case.ts';
import type { PromotionFactRow } from '../../domain/agent/agent-memory.port.ts';

@Controller('orgs/:orgId/agents/:agentId')
export class MemoryController {
  constructor(
    private readonly listPins: ListPinsUseCase,
    private readonly upsertPin: UpsertPinUseCase,
    private readonly deletePin: DeletePinUseCase,
    private readonly listSemantic: ListSemanticUseCase,
    private readonly upsertSemantic: UpsertSemanticUseCase,
    private readonly updateSemantic: UpdateSemanticUseCase,
    private readonly deleteSemantic: DeleteSemanticUseCase,
    private readonly listPromotions: ListPromotionsUseCase,
    private readonly approvePromotion: ApprovePromotionUseCase,
    private readonly rejectPromotion: RejectPromotionUseCase,
  ) {}

  @Get('pins')
  pins(@Param('orgId') orgId: string, @Param('agentId') agentId: string): Promise<PinRecord[]> {
    return this.listPins.execute({ orgId, agentId });
  }

  @Put('pins/:key')
  putPin(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
    @Body(UpsertPinBodySchema) body: UpsertPinBody,
  ): Promise<PinRecord> {
    return this.upsertPin.execute({
      orgId,
      agentId,
      key: decodeURIComponent(key),
      text: body.text,
    });
  }

  @Delete('pins/:key')
  @HttpCode(204)
  removePin(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
  ): Promise<void> {
    return this.deletePin.execute({ orgId, agentId, key: decodeURIComponent(key) });
  }

  @Get('semantic')
  semantic(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Query(ListSemanticQuerySchema) query: ListSemanticQuery,
  ): Promise<MemoryRecord[]> {
    return this.listSemantic.execute({ orgId, agentId, scope: query.scope, limit: query.limit });
  }

  @Post('semantic')
  @HttpCode(201)
  postSemantic(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Body(UpsertSemanticBodySchema) body: UpsertSemanticBody,
  ): Promise<MemoryRecord> {
    return this.upsertSemantic.execute({ orgId, agentId, ...body });
  }

  @Patch('semantic/:id')
  patchSemantic(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
    @Body(UpdateSemanticBodySchema) body: UpdateSemanticBody,
  ): Promise<MemoryRecord> {
    return this.updateSemantic.execute({ orgId, agentId, id, text: body.text });
  }

  @Delete('semantic/:id')
  @HttpCode(204)
  removeSemantic(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.deleteSemantic.execute({ orgId, agentId, id });
  }

  @Get('memory/promotions')
  promotions(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
  ): Promise<PromotionFactRow[]> {
    return this.listPromotions.execute({ orgId, agentId });
  }

  @Post('memory/promotions/:promotionId/approve')
  @HttpCode(200)
  approve(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('promotionId') promotionId: string,
  ): Promise<PromotionDecisionResult> {
    return this.approvePromotion.execute({ orgId, agentId, promotionId });
  }

  @Post('memory/promotions/:promotionId/reject')
  @HttpCode(200)
  reject(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Param('promotionId') promotionId: string,
  ): Promise<PromotionDecisionResult> {
    return this.rejectPromotion.execute({ orgId, agentId, promotionId });
  }
}

@Controller('orgs/:orgId/memory')
export class MemoryStatusController {
  constructor(
    private readonly memoryStatus: GetMemoryStatusUseCase,
    private readonly upsertSettings: UpsertMemorySettingsUseCase,
    private readonly runPass: RunMemoryPassUseCase,
  ) {}

  @Get('status')
  status(@Param('orgId') orgId: string): Promise<MemoryEmbeddingsStatus> {
    return this.memoryStatus.execute(orgId);
  }

  @Post('run')
  @HttpCode(200)
  run(@Param('orgId') orgId: string): Promise<MemoryEmbeddingsStatus> {
    return this.runPass.execute(orgId);
  }

  @Put('settings')
  @HttpCode(200)
  settings(
    @Param('orgId') orgId: string,
    @Body(MemorySettingsBodySchema) body: MemorySettingsBody,
  ): Promise<MemoryEmbeddingsStatus> {
    return this.upsertSettings.execute({
      orgId,
      ...(body.embedModelId === undefined ? {} : { embedModelId: body.embedModelId }),
      ...(body.decisionModelId === undefined ? {} : { decisionModelId: body.decisionModelId }),
    });
  }
}
