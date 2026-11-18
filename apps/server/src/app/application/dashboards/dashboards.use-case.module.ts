import { Module } from '@harnesys/brix';
import { ActivateWidgetUseCase } from './activate-widget.use-case.ts';
import { CreateDashboardUseCase } from './create-dashboard.use-case.ts';
import { CreateWidgetUseCase } from './create-widget.use-case.ts';
import { DashboardsToolsProvider } from './dashboard-tools.provider.ts';
import { DeleteDashboardUseCase } from './delete-dashboard.use-case.ts';
import { DeleteWidgetUseCase } from './delete-widget.use-case.ts';
import { GetDashboardUseCase } from './get-dashboard.use-case.ts';
import { GetDashboardsCatalogUseCase } from './get-dashboards-catalog.use-case.ts';
import { GetWidgetStateUseCase } from './get-widget-state.use-case.ts';
import { InvokeWidgetSourceUseCase } from './invoke-widget-source.use-case.ts';
import { ListDashboardsUseCase } from './list-dashboards.use-case.ts';
import { PutWidgetStateUseCase } from './put-widget-state.use-case.ts';
import { TestWidgetSourceUseCase } from './test-widget-source.use-case.ts';
import { UpdateDashboardUseCase } from './update-dashboard.use-case.ts';
import { UpdateLayoutUseCase } from './update-layout.use-case.ts';
import { UpdateWidgetUseCase } from './update-widget.use-case.ts';

const useCases = [
  ListDashboardsUseCase,
  CreateDashboardUseCase,
  GetDashboardUseCase,
  GetDashboardsCatalogUseCase,
  UpdateDashboardUseCase,
  DeleteDashboardUseCase,
  CreateWidgetUseCase,
  UpdateWidgetUseCase,
  DeleteWidgetUseCase,
  UpdateLayoutUseCase,
  ActivateWidgetUseCase,
  InvokeWidgetSourceUseCase,
  TestWidgetSourceUseCase,
  GetWidgetStateUseCase,
  PutWidgetStateUseCase,
];

@Module({
  providers: [...useCases, DashboardsToolsProvider],
  exports: [...useCases],
})
export class DashboardsUseCaseModule {}
