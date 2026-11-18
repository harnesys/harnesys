import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { CreateDashboardBody } from '@harnesys/contracts';
import type { DashboardRecord } from '../../domain/dashboards/dashboard.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { DashboardsNotifierPort } from '../../domain/dashboards/dashboards-notifier.port.ts';

export interface CreateDashboardRequest {
  orgId: string;
  body: CreateDashboardBody;
}

@Injectable()
export class CreateDashboardUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly notifier: DashboardsNotifierPort,
  ) {}

  execute(request: CreateDashboardRequest): { id: string } {
    const now = new Date().toISOString();
    const record: DashboardRecord = this.store.insertDashboard({
      orgId: request.orgId,
      id: randomUUID(),
      name: request.body.name,
      color: request.body.color ?? null,
      ...(request.body.icon ? { icon: request.body.icon } : {}),
      createdAt: now,
      updatedAt: now,
    });
    this.notifier.changed(request.orgId, record.id, 'dashboard.created');
    return { id: record.id };
  }
}
