import { Controller, Get, UseGuards } from '@harnesys/brix';
import type { CatalogResponse } from '@harnesys/contracts';
import { ListCatalogUseCase } from '../../application/apps/catalog/list-catalog.use-case.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/apps')
export class AppsCatalogController {
  constructor(private readonly catalog: ListCatalogUseCase) {}

  @Get('catalog')
  list(): CatalogResponse {
    return this.catalog.execute();
  }
}
