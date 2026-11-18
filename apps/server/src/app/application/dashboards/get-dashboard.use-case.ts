import { Injectable } from '@harnesys/brix';
import type { DashboardDetail } from '@harnesys/contracts';
import { DashboardNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { toDashboardDetail } from './dashboard.helpers.ts';

export interface GetDashboardRequest {
  orgId: string;
  dashboardId: string;
}

@Injectable()
export class GetDashboardUseCase {
  constructor(private readonly store: DashboardStorePort) {}

  execute(request: GetDashboardRequest): DashboardDetail {
    const record = this.store.findDashboard(request.orgId, request.dashboardId);
    if (!record) {
      throw new DashboardNotFoundException(request.dashboardId);
    }
    return toDashboardDetail(record, this.store.listWidgets(request.orgId, request.dashboardId));
  }
}
