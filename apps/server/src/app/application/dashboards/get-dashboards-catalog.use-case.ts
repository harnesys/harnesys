import { Injectable } from '@harnesys/brix';
import type { DashboardsCatalogResponse } from '@harnesys/contracts';
import { dashboardCatalogResponse } from '@harnesys/contracts';

@Injectable()
export class GetDashboardsCatalogUseCase {
  execute(): DashboardsCatalogResponse {
    return dashboardCatalogResponse();
  }
}
