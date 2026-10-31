import { Controller, Delete, Get, HttpCode, Param, Query } from '@harnesys/brix';
import type { ListPermissionGrantsQuery, ListPermissionGrantsResponse } from '@harnesys/contracts';
import { ListPermissionGrantsQuerySchema } from '@harnesys/contracts';
import { ListPermissionGrantsUseCase } from '../../application/approvals/list-permission-grants.use-case.ts';
import { RevokePermissionGrantUseCase } from '../../application/approvals/revoke-permission-grant.use-case.ts';

@Controller('orgs/:orgId/permission-grants')
export class PermissionGrantsController {
  constructor(
    private readonly listGrants: ListPermissionGrantsUseCase,
    private readonly revokeGrant: RevokePermissionGrantUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(ListPermissionGrantsQuerySchema) query: ListPermissionGrantsQuery,
  ): ListPermissionGrantsResponse {
    return this.listGrants.execute({ orgId, ...query });
  }

  @Delete(':grantId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('grantId') grantId: string): void {
    this.revokeGrant.execute({ orgId, grantId });
  }
}
