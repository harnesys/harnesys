import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@harnesys/brix';
import type {
  AccountResponse,
  AccountsListQuery,
  AccountsListResponse,
  RegisterAccountBody,
  RegisterAccountResponse,
  UpdateAccountBody,
} from '@harnesys/contracts';
import {
  AccountsListQuerySchema,
  RegisterAccountBodySchema,
  UpdateAccountBodySchema,
} from '@harnesys/contracts';
import { DeleteAccountUseCase } from '../../application/apps/delete-account.use-case.ts';
import {
  GetAccountUseCase,
  ListAccountsUseCase,
} from '../../application/apps/list-accounts.use-case.ts';
import { RegisterAccountUseCase } from '../../application/apps/register-account.use-case.ts';
import { UpdateAccountUseCase } from '../../application/apps/update-account.use-case.ts';

@Controller('orgs/:orgId/accounts')
export class AccountsController {
  constructor(
    private readonly listAccounts: ListAccountsUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly updateAccount: UpdateAccountUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(AccountsListQuerySchema) query: AccountsListQuery,
  ): Promise<AccountsListResponse> {
    return this.listAccounts.execute({ orgId, ...query });
  }

  @Post()
  register(
    @Param('orgId') orgId: string,
    @Body(RegisterAccountBodySchema) body: RegisterAccountBody,
  ): Promise<RegisterAccountResponse> {
    return this.registerAccount.execute({ orgId, ...body });
  }

  @Get(':accountId')
  get(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
  ): Promise<AccountResponse> {
    return this.getAccount.execute({ orgId, accountId });
  }

  @Patch(':accountId')
  update(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string,
    @Body(UpdateAccountBodySchema) body: UpdateAccountBody,
  ): Promise<AccountResponse> {
    return this.updateAccount.execute({ orgId, accountId, ...body });
  }

  @Delete(':accountId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('accountId') accountId: string): Promise<void> {
    return this.deleteAccount.execute({ orgId, accountId });
  }
}
