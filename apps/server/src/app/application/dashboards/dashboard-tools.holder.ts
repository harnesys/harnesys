import type { ActivateWidgetUseCase } from './activate-widget.use-case.ts';
import type { CreateDashboardUseCase } from './create-dashboard.use-case.ts';
import type { CreateWidgetUseCase } from './create-widget.use-case.ts';
import type { DeleteDashboardUseCase } from './delete-dashboard.use-case.ts';
import type { DeleteWidgetUseCase } from './delete-widget.use-case.ts';
import type { GetDashboardUseCase } from './get-dashboard.use-case.ts';
import type { ListDashboardsUseCase } from './list-dashboards.use-case.ts';
import type { TestWidgetSourceUseCase } from './test-widget-source.use-case.ts';
import type { UpdateDashboardUseCase } from './update-dashboard.use-case.ts';
import type { UpdateLayoutUseCase } from './update-layout.use-case.ts';
import type { UpdateWidgetUseCase } from './update-widget.use-case.ts';

export interface OrgDashboardsDeps {
  listDashboards: Pick<ListDashboardsUseCase, 'execute'>;
  getDashboard: Pick<GetDashboardUseCase, 'execute'>;
  createDashboard: Pick<CreateDashboardUseCase, 'execute'>;
  updateDashboard: Pick<UpdateDashboardUseCase, 'execute'>;
  deleteDashboard: Pick<DeleteDashboardUseCase, 'execute'>;
  createWidget: Pick<CreateWidgetUseCase, 'execute'>;
  updateWidget: Pick<UpdateWidgetUseCase, 'execute'>;
  deleteWidget: Pick<DeleteWidgetUseCase, 'execute'>;
  updateLayout: Pick<UpdateLayoutUseCase, 'execute'>;
  activateWidget: Pick<ActivateWidgetUseCase, 'execute'>;
  testSource: Pick<TestWidgetSourceUseCase, 'execute'>;
}

let current: OrgDashboardsDeps | undefined;

export function setDashboardsToolsDeps(deps: OrgDashboardsDeps): void {
  current = deps;
}

export function dashboardsToolsDeps(): OrgDashboardsDeps | undefined {
  return current;
}
