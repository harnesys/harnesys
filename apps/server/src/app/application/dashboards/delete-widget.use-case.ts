import { Injectable } from '@harnesys/brix';
import { DashboardWidgetNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';

export interface DeleteWidgetRequest {
  orgId: string;
  dashboardId: string;
  widgetId: string;
}

@Injectable()
export class DeleteWidgetUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: DeleteWidgetRequest): void {
    const removed = this.store.deleteWidget(request.orgId, request.dashboardId, request.widgetId);
    if (!removed) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    this.notifier.changed(request.orgId, request.dashboardId, 'widget.deleted');
  }
}
