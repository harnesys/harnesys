import { Injectable } from '@harnesys/brix';
import type { DashboardListResponse } from '@harnesys/contracts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { toDashboardSummary } from './dashboard.helpers.ts';

export interface ListDashboardsRequest {
  orgId: string;
}

@Injectable()
export class ListDashboardsUseCase {
  constructor(private readonly store: DashboardStorePort) {}

  execute(request: ListDashboardsRequest): DashboardListResponse {
    return {
      items: this.store
        .list(request.orgId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((record) => toDashboardSummary(record, record.widgetCount)),
    };
  }
}
