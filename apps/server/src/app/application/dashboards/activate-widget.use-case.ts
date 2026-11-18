import { Injectable } from '@harnesys/brix';
import type { DashboardWidget } from '@harnesys/contracts';
import {
  DashboardWidgetNotFoundException,
  DashboardWidgetStatusException,
} from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';
import { toDashboardWidget } from './dashboard.helpers.ts';

export interface ActivateWidgetRequest {
  orgId: string;
  dashboardId: string;
  widgetId: string;
}

@Injectable()
export class ActivateWidgetUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: ActivateWidgetRequest): DashboardWidget {
    const existing = this.store.findWidget(request.orgId, request.dashboardId, request.widgetId);
    if (!existing) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    if (existing.status === 'active') {
      throw new DashboardWidgetStatusException(request.widgetId, 'active');
    }
    const record = this.store.updateWidget(request.orgId, request.dashboardId, request.widgetId, {
      status: 'active',
      updatedAt: new Date().toISOString(),
    });
    if (!record) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    this.notifier.changed(request.orgId, request.dashboardId, 'widget.activated');
    return toDashboardWidget(record);
  }
}
