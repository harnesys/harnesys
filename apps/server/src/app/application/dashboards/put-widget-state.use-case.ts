import { Injectable } from '@harnesys/brix';
import type { JsonValue } from '@harnesys/contracts';
import { DashboardWidgetNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';
import type { WidgetStateSnapshot } from './get-widget-state.use-case.ts';

export interface PutWidgetStateRequest {
  orgId: string;
  dashboardId: string;
  widgetId: string;
  state: Record<string, JsonValue>;
}

@Injectable()
export class PutWidgetStateUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: PutWidgetStateRequest): WidgetStateSnapshot {
    const widget = this.store.findWidget(request.orgId, request.dashboardId, request.widgetId);
    if (!widget) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    const persisted = new Set(widget.doc.persistedState ?? []);
    const state: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(request.state)) {
      if (persisted.has(key)) {
        state[key] = value;
      }
    }
    this.store.writeWidgetState(request.orgId, request.widgetId, state, new Date().toISOString());
    this.notifier.changed(request.orgId, request.dashboardId, 'widget.state', {
      widgetId: request.widgetId,
      state,
    });
    return { state };
  }
}
