import { Injectable } from '@harnesys/brix';
import type { JsonValue } from '@harnesys/contracts';
import { DashboardWidgetNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';

export interface GetWidgetStateRequest {
  orgId: string;
  dashboardId: string;
  widgetId: string;
}

export interface WidgetStateSnapshot {
  state: Record<string, JsonValue>;
}

@Injectable()
export class GetWidgetStateUseCase {
  constructor(private readonly store: DashboardStorePort) {}

  execute(request: GetWidgetStateRequest): WidgetStateSnapshot {
    const widget = this.store.findWidget(request.orgId, request.dashboardId, request.widgetId);
    if (!widget) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    const persisted = new Set(widget.doc.persistedState ?? []);
    const stored = this.store.readWidgetState(request.orgId, request.widgetId);
    const state: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (persisted.has(key)) {
        state[key] = value;
      }
    }
    return { state };
  }
}
