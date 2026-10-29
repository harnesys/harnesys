import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@harnesys/brix';
import type {
  BoardRuleInput,
  BoardStatusInput,
  CreateIssueBoardBody,
  CreateIssueBoardResponse,
  GetIssueBoardResponse,
  ListIssueBoardsResponse,
  ReorderBoardRulesBody,
  ReorderBoardStatusesBody,
  UpdateIssueBoardBody,
} from '@harnesys/contracts';
import {
  BoardRuleInputSchema,
  BoardStatusInputSchema,
  CreateIssueBoardBodySchema,
  ReorderBoardRulesBodySchema,
  ReorderBoardStatusesBodySchema,
  UpdateIssueBoardBodySchema,
} from '@harnesys/contracts';
import { AddBoardStatusUseCase } from '../../application/issues/add-board-status.use-case.ts';
import { CreateIssueBoardUseCase } from '../../application/issues/create-issue-board.use-case.ts';
import { DeleteIssueBoardUseCase } from '../../application/issues/delete-issue-board.use-case.ts';
import { GetIssueBoardUseCase } from '../../application/issues/get-issue-board.use-case.ts';
import { ListIssueBoardsUseCase } from '../../application/issues/list-issue-boards.use-case.ts';
import { RemoveBoardRuleUseCase } from '../../application/issues/remove-board-rule.use-case.ts';
import { RemoveBoardStatusUseCase } from '../../application/issues/remove-board-status.use-case.ts';
import { ReorderBoardRulesUseCase } from '../../application/issues/reorder-board-rules.use-case.ts';
import { ReorderBoardStatusesUseCase } from '../../application/issues/reorder-board-statuses.use-case.ts';
import { SaveBoardRuleUseCase } from '../../application/issues/save-board-rule.use-case.ts';
import { SetIssueBoardArchiveUseCase } from '../../application/issues/set-issue-board-archive.use-case.ts';
import { UpdateBoardStatusUseCase } from '../../application/issues/update-board-status.use-case.ts';
import { UpdateIssueBoardUseCase } from '../../application/issues/update-issue-board.use-case.ts';
import { principalUserId } from '../../application/threads/run-attribution.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs/:orgId/boards')
export class BoardsController {
  constructor(
    private readonly listBoards: ListIssueBoardsUseCase,
    private readonly createBoard: CreateIssueBoardUseCase,
    private readonly getBoard: GetIssueBoardUseCase,
    private readonly updateBoard: UpdateIssueBoardUseCase,
    private readonly addBoardStatus: AddBoardStatusUseCase,
    private readonly updateBoardStatus: UpdateBoardStatusUseCase,
    private readonly removeBoardStatus: RemoveBoardStatusUseCase,
    private readonly reorderBoardStatuses: ReorderBoardStatusesUseCase,
    private readonly saveBoardRule: SaveBoardRuleUseCase,
    private readonly removeBoardRule: RemoveBoardRuleUseCase,
    private readonly reorderBoardRules: ReorderBoardRulesUseCase,
    private readonly setArchive: SetIssueBoardArchiveUseCase,
    private readonly deleteBoard: DeleteIssueBoardUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListIssueBoardsResponse {
    return this.listBoards.execute(orgId);
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateIssueBoardBodySchema) body: CreateIssueBoardBody,
  ): CreateIssueBoardResponse {
    return this.createBoard.execute({ orgId, body });
  }

  @Get(':boardId')
  get(@Param('orgId') orgId: string, @Param('boardId') boardId: string): GetIssueBoardResponse {
    return this.getBoard.execute({ orgId, boardId });
  }

  @Patch(':boardId')
  update(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Body(UpdateIssueBoardBodySchema) body: UpdateIssueBoardBody,
  ): GetIssueBoardResponse {
    return this.updateBoard.execute({ orgId, boardId, body });
  }

  @Post(':boardId/statuses')
  @HttpCode(201)
  addStatus(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Body(BoardStatusInputSchema) input: BoardStatusInput,
  ): GetIssueBoardResponse {
    return this.addBoardStatus.execute({ orgId, boardId, input });
  }

  @Put(':boardId/statuses/order')
  reorderStatuses(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Body(ReorderBoardStatusesBodySchema) body: ReorderBoardStatusesBody,
  ): GetIssueBoardResponse {
    return this.reorderBoardStatuses.execute({ orgId, boardId, order: body.order });
  }

  @Patch(':boardId/statuses/:statusKey')
  updateStatus(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Param('statusKey') statusKey: string,
    @Body(BoardStatusInputSchema) input: BoardStatusInput,
  ): GetIssueBoardResponse {
    return this.updateBoardStatus.execute({ orgId, boardId, statusKey, input });
  }

  @Delete(':boardId/statuses/:statusKey')
  removeStatus(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Param('statusKey') statusKey: string,
  ): GetIssueBoardResponse {
    return this.removeBoardStatus.execute({ orgId, boardId, statusKey });
  }

  @Post(':boardId/rules')
  @HttpCode(201)
  saveRule(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @SessionPrincipal() principal: Principal,
    @Body(BoardRuleInputSchema) input: BoardRuleInput,
  ): GetIssueBoardResponse {
    return this.saveBoardRule.execute({
      orgId,
      boardId,
      actorUserId: principalUserId(principal),
      input,
    });
  }

  @Put(':boardId/rules/order')
  reorderRules(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Body(ReorderBoardRulesBodySchema) body: ReorderBoardRulesBody,
  ): GetIssueBoardResponse {
    return this.reorderBoardRules.execute({ orgId, boardId, order: body.order });
  }

  @Patch(':boardId/rules/:ruleId')
  updateRule(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Param('ruleId') ruleId: string,
    @SessionPrincipal() principal: Principal,
    @Body(BoardRuleInputSchema) input: BoardRuleInput,
  ): GetIssueBoardResponse {
    return this.saveBoardRule.execute({
      orgId,
      boardId,
      ruleId,
      actorUserId: principalUserId(principal),
      input,
    });
  }

  @Delete(':boardId/rules/:ruleId')
  removeRule(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
    @Param('ruleId') ruleId: string,
  ): GetIssueBoardResponse {
    return this.removeBoardRule.execute({ orgId, boardId, ruleId });
  }

  @Patch(':boardId/archive')
  archive(@Param('orgId') orgId: string, @Param('boardId') boardId: string): GetIssueBoardResponse {
    return this.setArchive.execute({ orgId, boardId, archived: true });
  }

  @Patch(':boardId/unarchive')
  unarchive(
    @Param('orgId') orgId: string,
    @Param('boardId') boardId: string,
  ): GetIssueBoardResponse {
    return this.setArchive.execute({ orgId, boardId, archived: false });
  }

  @Delete(':boardId')
  @HttpCode(204)
  async delete(@Param('orgId') orgId: string, @Param('boardId') boardId: string): Promise<void> {
    await this.deleteBoard.execute({ orgId, boardId });
  }
}
