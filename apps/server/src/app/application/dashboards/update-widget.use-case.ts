import { Injectable } from '@harnesys/brix';
import type { DashboardWidget, UpdateWidgetBody } from '@harnesys/contracts';
import {
  DashboardWidgetConflictException,
  DashboardWidgetNotFoundException,
} from '../../domain/dashboards/dashboard.error.ts';
import type { DashboardWidgetPatch } from '../../domain/dashboards/dashboard.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';
import { validateWidgetDoc } from '../../domain/dashboards/widget-doc.guard.ts';
import { toDashboardWidget } from './dashboard.helpers.ts';

export interface UpdateWidgetRequest {
  orgId: string;
  dashboardId: string;
  widgetId: string;
  body: UpdateWidgetBody;
  baseUpdatedAt?: string;
}

@Injectable()
export class UpdateWidgetUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: UpdateWidgetRequest): DashboardWidget {
    const existing = this.store.findWidget(request.orgId, request.dashboardId, request.widgetId);
    if (!existing) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    if (request.baseUpdatedAt !== undefined && request.baseUpdatedAt !== existing.updatedAt) {
      throw new DashboardWidgetConflictException(
        request.widgetId,
        request.baseUpdatedAt,
        existing.updatedAt,
      );
    }
    const patch: DashboardWidgetPatch = {
      ...(request.body.rect !== undefined ? { rect: request.body.rect } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (request.body.doc !== undefined) {
      patch.doc = validateWidgetDoc(request.orgId, request.body.doc);
      if (existing.status === 'active' && existing.createdBy === 'agent') {
        patch.status = 'draft';
      }
    }
    const record = this.store.updateWidget(
      request.orgId,
      request.dashboardId,
      request.widgetId,
      patch,
    );
    if (!record) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    this.notifier.changed(request.orgId, request.dashboardId, 'widget.updated');
    return toDashboardWidget(record);
  }
}
