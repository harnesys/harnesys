import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@harnesys/brix';
import type {
  ApprovalPublic,
  CreateApprovalBody,
  DecideApprovalBody,
  DecideApprovalResponse,
  ListApprovalsQuery,
  ListApprovalsResponse,
} from '@harnesys/contracts';
import {
  CreateApprovalBodySchema,
  DecideApprovalBodySchema,
  ListApprovalsQuerySchema,
} from '@harnesys/contracts';
import { DecideApprovalUseCase } from '../../application/approvals/decide-approval.use-case.ts';
import { GetApprovalUseCase } from '../../application/approvals/get-approval.use-case.ts';
import { ListApprovalsUseCase } from '../../application/approvals/list-approvals.use-case.ts';
import { RequestApprovalUseCase } from '../../application/approvals/request-approval.use-case.ts';

@Controller('orgs/:orgId/approvals')
export class ApprovalsController {
  constructor(
    private readonly listApprovals: ListApprovalsUseCase,
    private readonly getApproval: GetApprovalUseCase,
    private readonly requestApproval: RequestApprovalUseCase,
    private readonly decideApproval: DecideApprovalUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(ListApprovalsQuerySchema) query: ListApprovalsQuery,
  ): ListApprovalsResponse {
    return this.listApprovals.execute({ orgId, query });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateApprovalBodySchema) body: CreateApprovalBody,
  ): ApprovalPublic {
    return this.requestApproval.execute({ orgId, body });
  }

  @Get(':approvalId')
  get(@Param('orgId') orgId: string, @Param('approvalId') approvalId: string): ApprovalPublic {
    return this.getApproval.execute({ orgId, approvalId });
  }

  @Post(':approvalId/decide')
  @HttpCode(200)
  decide(
    @Param('orgId') orgId: string,
    @Param('approvalId') approvalId: string,
    @Body(DecideApprovalBodySchema) body: DecideApprovalBody,
  ): Promise<DecideApprovalResponse> {
    return this.decideApproval.execute({ orgId, approvalId, body });
  }
}
