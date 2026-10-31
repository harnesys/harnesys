import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@harnesys/brix';
import type {
  CreatePermissionRuleBody,
  ListPermissionRulesQuery,
  ListPermissionRulesResponse,
} from '@harnesys/contracts';
import {
  CreatePermissionRuleBodySchema,
  ListPermissionRulesQuerySchema,
} from '@harnesys/contracts';
import { CreatePermissionRuleUseCase } from '../../application/approvals/create-permission-rule.use-case.ts';
import { ListPermissionRulesUseCase } from '../../application/approvals/list-permission-rules.use-case.ts';
import { RevokePermissionRuleUseCase } from '../../application/approvals/revoke-permission-rule.use-case.ts';

@Controller('orgs/:orgId/permission-rules')
export class PermissionRulesController {
  constructor(
    private readonly listRules: ListPermissionRulesUseCase,
    private readonly createRule: CreatePermissionRuleUseCase,
    private readonly revokeRule: RevokePermissionRuleUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(ListPermissionRulesQuerySchema) query: ListPermissionRulesQuery,
  ): ListPermissionRulesResponse {
    return this.listRules.execute({ orgId, ...query });
  }

  @Post()
  create(
    @Param('orgId') orgId: string,
    @Body(CreatePermissionRuleBodySchema) body: CreatePermissionRuleBody,
  ): void {
    this.createRule.execute({ orgId, body });
  }

  @Delete(':ruleId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('ruleId') ruleId: string): void {
    this.revokeRule.execute({ orgId, ruleId });
  }
}
