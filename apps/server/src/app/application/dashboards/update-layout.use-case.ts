import { Injectable } from '@harnesys/brix';
import { DashboardNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import type { DashboardLayoutItemInput } from '../../domain/dashboards/dashboard.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';

export interface UpdateLayoutRequest {
  orgId: string;
  dashboardId: string;
  items: DashboardLayoutItemInput[];
}

@Injectable()
export class UpdateLayoutUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: UpdateLayoutRequest): { ok: true } {
    if (!this.store.findDashboard(request.orgId, request.dashboardId)) {
      throw new DashboardNotFoundException(request.dashboardId);
    }
    this.store.updateLayout(
      request.orgId,
      request.dashboardId,
      request.items,
      new Date().toISOString(),
    );
    this.notifier.changed(request.orgId, request.dashboardId, 'layout.updated');
    return { ok: true };
  }
}
