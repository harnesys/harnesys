import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { DashboardWidgetStatus, UpsertWidgetBody } from '@harnesys/contracts';
import { DashboardNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import type { DashboardWidgetRecord } from '../../domain/dashboards/dashboard.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';
import { validateWidgetDoc } from '../../domain/dashboards/widget-doc.guard.ts';

export interface CreateWidgetRequest {
  orgId: string;
  dashboardId: string;
  body: UpsertWidgetBody;
  status: DashboardWidgetStatus;
  createdBy?: string;
}

@Injectable()
export class CreateWidgetUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: CreateWidgetRequest): { widgetId: string } {
    if (!this.store.findDashboard(request.orgId, request.dashboardId)) {
      throw new DashboardNotFoundException(request.dashboardId);
    }
    const doc = validateWidgetDoc(request.orgId, request.body.doc);
    const now = new Date().toISOString();
    const record: DashboardWidgetRecord = this.store.insertWidget({
      orgId: request.orgId,
      id: randomUUID(),
      dashboardId: request.dashboardId,
      rect: request.body.rect,
      doc,
      status: request.status,
      ...(request.createdBy ? { createdBy: request.createdBy } : {}),
      createdAt: now,
      updatedAt: now,
    });
    this.notifier.changed(request.orgId, request.dashboardId, 'widget.created');
    return { widgetId: record.id };
  }
}
