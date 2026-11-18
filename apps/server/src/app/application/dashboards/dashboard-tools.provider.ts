import { Injectable } from '@harnesys/brix';
import { ActivateWidgetUseCase } from './activate-widget.use-case.ts';
import { CreateDashboardUseCase } from './create-dashboard.use-case.ts';
import { CreateWidgetUseCase } from './create-widget.use-case.ts';
import type { OrgDashboardsDeps } from './dashboard-tools.holder.ts';
import { setDashboardsToolsDeps } from './dashboard-tools.holder.ts';
import { DeleteDashboardUseCase } from './delete-dashboard.use-case.ts';
import { DeleteWidgetUseCase } from './delete-widget.use-case.ts';
import { GetDashboardUseCase } from './get-dashboard.use-case.ts';
import { ListDashboardsUseCase } from './list-dashboards.use-case.ts';
import { TestWidgetSourceUseCase } from './test-widget-source.use-case.ts';
import { UpdateDashboardUseCase } from './update-dashboard.use-case.ts';
import { UpdateLayoutUseCase } from './update-layout.use-case.ts';
import { UpdateWidgetUseCase } from './update-widget.use-case.ts';

@Injectable()
export class DashboardsToolsProvider {
  constructor(
    private readonly listDashboards: ListDashboardsUseCase,
    private readonly getDashboard: GetDashboardUseCase,
    private readonly createDashboard: CreateDashboardUseCase,
    private readonly updateDashboard: UpdateDashboardUseCase,
    private readonly deleteDashboard: DeleteDashboardUseCase,
    private readonly createWidget: CreateWidgetUseCase,
    private readonly updateWidget: UpdateWidgetUseCase,
    private readonly deleteWidget: DeleteWidgetUseCase,
    private readonly updateLayout: UpdateLayoutUseCase,
    private readonly activateWidget: ActivateWidgetUseCase,
    private readonly testSource: TestWidgetSourceUseCase,
  ) {
    const deps: OrgDashboardsDeps = {
      listDashboards: this.listDashboards,
      getDashboard: this.getDashboard,
      createDashboard: this.createDashboard,
      updateDashboard: this.updateDashboard,
      deleteDashboard: this.deleteDashboard,
      createWidget: this.createWidget,
      updateWidget: this.updateWidget,
      deleteWidget: this.deleteWidget,
      updateLayout: this.updateLayout,
      activateWidget: this.activateWidget,
      testSource: this.testSource,
    };
    setDashboardsToolsDeps(deps);
  }
}
