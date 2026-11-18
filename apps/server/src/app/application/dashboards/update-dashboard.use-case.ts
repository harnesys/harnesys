import { Injectable } from '@harnesys/brix';
import type { DashboardDetail, UpdateDashboardBody } from '@harnesys/contracts';
import { DashboardNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';
import { toDashboardDetail } from './dashboard.helpers.ts';

export interface UpdateDashboardRequest {
  orgId: string;
  dashboardId: string;
  body: UpdateDashboardBody;
}

@Injectable()
export class UpdateDashboardUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: UpdateDashboardRequest): DashboardDetail {
    const record = this.store.updateDashboard(request.orgId, request.dashboardId, {
      ...(request.body.name !== undefined ? { name: request.body.name } : {}),
      ...(request.body.color !== undefined ? { color: request.body.color } : {}),
      ...(request.body.icon !== undefined ? { icon: request.body.icon } : {}),
      updatedAt: new Date().toISOString(),
    });
    if (!record) {
      throw new DashboardNotFoundException(request.dashboardId);
    }
    this.notifier.changed(request.orgId, request.dashboardId, 'dashboard.updated');
    return toDashboardDetail(record, this.store.listWidgets(request.orgId, request.dashboardId));
  }
}
