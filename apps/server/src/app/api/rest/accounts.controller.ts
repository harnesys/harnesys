import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@harnesys/brix';
import type {
  AccountResponse,
  AccountsListQuery,
  AccountsListResponse,
  UpdateAccountBody,
} from '@harnesys/contracts';
import { AccountsListQuerySchema, UpdateAccountBodySchema } from '@harnesys/contracts';
import { DeleteAccountUseCase } from '../../application/apps/accounts/delete-account.use-case.ts';
import {
  GetAccountUseCase,
  ListAccountsUseCase,
} from '../../application/apps/accounts/list-account.use-case.ts';
import { UpdateAccountUseCase } from '../../application/apps/accounts/update-account.use-case.ts';
import { VerifyAccountUseCase } from '../../application/apps/accounts/verify-account.use-case.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import { appsResponse } from './apps-response.ts';

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/accounts')
export class AccountsController {
  constructor(
    private readonly listAccounts: ListAccountsUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly updateAccount: UpdateAccountUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
    private readonly verifyAccount: VerifyAccountUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(AccountsListQuerySchema) query: AccountsListQuery,
  ): AccountsListResponse {
    return this.listAccounts.execute({
      orgId,
      kind: query.kind,
      appId: query.appId,
      status: query.status,
      scopes: query.scopes
        ?.split(',')
        .map((scope) => scope.trim())
        .filter(Boolean),
    });
  }

  @Get(':accountId')
  get(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
  ): Promise<AccountResponse | Response> {
    return appsResponse(() => this.getAccount.execute({ orgId, accountId }));
  }

  @Patch(':accountId')
  update(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @Body(UpdateAccountBodySchema) body: UpdateAccountBody,
  ) {
    return appsResponse(() => this.updateAccount.execute({ orgId, accountId, ...body }));
  }

  @Delete(':accountId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('accountId') accountId: string) {
    return appsResponse(() => this.deleteAccount.execute({ orgId, accountId }));
  }

  @Post(':accountId/verify')
  @HttpCode(200)
  verify(@Param('orgId') orgId: string, @Param('accountId') accountId: string) {
    return appsResponse(() => this.verifyAccount.execute({ orgId, accountId }));
  }
}
