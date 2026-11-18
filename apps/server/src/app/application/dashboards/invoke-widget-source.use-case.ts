import { Injectable } from '@harnesys/brix';
import type { WidgetInvokeBody, WidgetSource } from '@harnesys/contracts';
import { DashboardWidgetNotFoundException } from '../../domain/dashboards/dashboard.error.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import type { SourceRunResult } from '../../domain/dashboards/source-runner.port.ts';
import { SourceRunnerPort } from '../../domain/dashboards/source-runner.port.ts';

export interface InvokeWidgetSourceRequest {
  orgId: string;
  dashboardId: string;
  widgetId: string;
  body: WidgetInvokeBody;
}

export const ORG_API_INVOKE_ERROR = 'orgApi sources are fetched by the client natively';

@Injectable()
export class InvokeWidgetSourceUseCase {
  constructor(
    private readonly store: DashboardStorePort,
    private readonly runner: SourceRunnerPort,
  ) {}

  async execute(request: InvokeWidgetSourceRequest): Promise<SourceRunResult> {
    const widget = this.store.findWidget(request.orgId, request.dashboardId, request.widgetId);
    if (!widget) {
      throw new DashboardWidgetNotFoundException(request.widgetId);
    }
    const source: WidgetSource | undefined = widget.doc.sources.find(
      (entry) => entry.id === request.body.sourceId,
    );
    if (!source) {
      return { ok: false, error: 'source_not_found' };
    }
    if (source.kind === 'orgApi') {
      return { ok: false, error: ORG_API_INVOKE_ERROR };
    }
    return this.runner.run(request.orgId, {
      widgetId: widget.id,
      source,
      ...(request.body.params === undefined ? {} : { params: request.body.params }),
    });
  }
}
