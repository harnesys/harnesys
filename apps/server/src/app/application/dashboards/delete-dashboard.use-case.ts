import { Injectable } from '@harnesys/brix';
import { DashboardNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';

export interface DeleteDashboardRequest {
  orgId: string;
  dashboardId: string;
}

@Injectable()
export class DeleteDashboardUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: DeleteDashboardRequest): void {
    const removed = this.store.deleteDashboard(request.orgId, request.dashboardId);
    if (!removed) {
      throw new DashboardNotFoundException(request.dashboardId);
    }
    this.notifier.changed(request.orgId, request.dashboardId, 'dashboard.deleted');
  }
}
