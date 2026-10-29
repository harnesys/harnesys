import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@harnesys/brix';
import type {
  CreateFileRuleBody,
  FileRulePublic,
  ListFileRulesResponse,
} from '@harnesys/contracts';
import { CreateFileRuleBodySchema } from '@harnesys/contracts';
import { CreateFileAccessRuleUseCase } from '../../application/file-access/create-file-access-rule.use-case.ts';
import { DeleteFileRuleUseCase } from '../../application/file-access/delete-file-rule.use-case.ts';
import { ListFileRulesUseCase } from '../../application/file-access/list-file-rules.use-case.ts';

@Controller('orgs/:orgId/file-rules')
export class FileRulesController {
  constructor(
    private readonly listRules: ListFileRulesUseCase,
    private readonly createRule: CreateFileAccessRuleUseCase,
    private readonly deleteRule: DeleteFileRuleUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListFileRulesResponse {
    return this.listRules.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateFileRuleBodySchema) body: CreateFileRuleBody,
  ): FileRulePublic {
    return this.createRule.execute({ orgId, body });
  }

  @Delete(':ruleId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('ruleId') ruleId: string): void {
    this.deleteRule.execute({ orgId, ruleId });
  }
}
