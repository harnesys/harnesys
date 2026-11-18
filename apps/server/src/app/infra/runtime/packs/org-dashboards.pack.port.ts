import type {
  DashboardDetail,
  DashboardListResponse,
  UpdateDashboardBody,
  UpdateLayoutBody,
  UpdateWidgetBody,
  UpsertWidgetBody,
  WidgetDoc,
  WidgetRect,
  WidgetSource,
} from '@harnesys/contracts';
import type { DashboardsPackPort, WidgetSourceTestResult } from 'harnesys';
import type { OrgDashboardsDeps } from '../../../application/dashboards/dashboard-tools.holder.ts';
import type { DashboardLayoutItemInput } from '../../../domain/dashboards/dashboard.ts';
import type { SourceRunResult } from '../../../domain/dashboards/source-runner.port.ts';

export class OrgDashboardsPackPort implements DashboardsPackPort {
  constructor(private readonly deps: OrgDashboardsDeps) {}

  createDashboard(orgId: string, name: string): Promise<{ id: string }> {
    return Promise.resolve(this.deps.createDashboard.execute({ orgId, body: { name } }));
  }

  listDashboards(orgId: string): Promise<DashboardListResponse> {
    return Promise.resolve(this.deps.listDashboards.execute({ orgId }));
  }

  getDashboard(orgId: string, dashboardId: string): Promise<DashboardDetail> {
    return Promise.resolve(this.deps.getDashboard.execute({ orgId, dashboardId }));
  }

  async updateDashboard(orgId: string, dashboardId: string, name: string): Promise<void> {
    const body: UpdateDashboardBody = { name };
    await this.deps.updateDashboard.execute({ orgId, dashboardId, body });
  }

  async deleteDashboard(orgId: string, dashboardId: string): Promise<void> {
    await this.deps.deleteDashboard.execute({ orgId, dashboardId });
  }

  createWidget(
    orgId: string,
    dashboardId: string,
    input: { rect: WidgetRect; doc: WidgetDoc; draft: boolean },
  ): Promise<{ widgetId: string }> {
    const body: UpsertWidgetBody = { rect: input.rect, doc: input.doc };
    return Promise.resolve(
      this.deps.createWidget.execute({
        orgId,
        dashboardId,
        body,
        status: input.draft ? 'draft' : 'active',
        createdBy: 'agent',
      }),
    );
  }

  async updateWidget(
    orgId: string,
    dashboardId: string,
    widgetId: string,
    patch: { rect?: WidgetRect; doc?: WidgetDoc },
  ): Promise<void> {
    const body: UpdateWidgetBody = {
      ...(patch.rect !== undefined ? { rect: patch.rect } : {}),
      ...(patch.doc !== undefined ? { doc: patch.doc } : {}),
    };
    await this.deps.updateWidget.execute({ orgId, dashboardId, widgetId, body });
  }

  async deleteWidget(orgId: string, dashboardId: string, widgetId: string): Promise<void> {
    await this.deps.deleteWidget.execute({ orgId, dashboardId, widgetId });
  }

  async updateLayout(orgId: string, dashboardId: string, body: UpdateLayoutBody): Promise<void> {
    const items: DashboardLayoutItemInput[] = body.items.map((item) => ({
      widgetId: item.widgetId,
      rect: item.rect,
    }));
    await this.deps.updateLayout.execute({ orgId, dashboardId, items });
  }

  async activateWidget(orgId: string, dashboardId: string, widgetId: string): Promise<void> {
    await this.deps.activateWidget.execute({ orgId, dashboardId, widgetId });
  }

  async testSource(orgId: string, source: WidgetSource): Promise<WidgetSourceTestResult> {
    const result: SourceRunResult = await this.deps.testSource.execute({
      orgId,
      body: { source },
    });
    return result;
  }
}
