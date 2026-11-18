import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@harnesys/brix';
import type {
  CreateDashboardBody,
  DashboardDetail,
  DashboardListResponse,
  DashboardsCatalogResponse,
  DashboardWidget,
  UpdateDashboardBody,
  UpdateLayoutBody,
  WidgetInvokeBody,
  WidgetSourceTestBody,
} from '@harnesys/contracts';
import {
  CreateDashboardBodySchema,
  UpdateDashboardBodySchema,
  UpdateLayoutBodySchema,
  WidgetInvokeBodySchema,
  WidgetSourceTestBodySchema,
} from '@harnesys/contracts';
import { ActivateWidgetUseCase } from '../../application/dashboards/activate-widget.use-case.ts';
import { CreateDashboardUseCase } from '../../application/dashboards/create-dashboard.use-case.ts';
import { CreateWidgetUseCase } from '../../application/dashboards/create-widget.use-case.ts';
import { DeleteDashboardUseCase } from '../../application/dashboards/delete-dashboard.use-case.ts';
import { DeleteWidgetUseCase } from '../../application/dashboards/delete-widget.use-case.ts';
import { GetDashboardUseCase } from '../../application/dashboards/get-dashboard.use-case.ts';
import { GetDashboardsCatalogUseCase } from '../../application/dashboards/get-dashboards-catalog.use-case.ts';
import type { WidgetStateSnapshot } from '../../application/dashboards/get-widget-state.use-case.ts';
import { GetWidgetStateUseCase } from '../../application/dashboards/get-widget-state.use-case.ts';
import { InvokeWidgetSourceUseCase } from '../../application/dashboards/invoke-widget-source.use-case.ts';
import { ListDashboardsUseCase } from '../../application/dashboards/list-dashboards.use-case.ts';
import { PutWidgetStateUseCase } from '../../application/dashboards/put-widget-state.use-case.ts';
import { TestWidgetSourceUseCase } from '../../application/dashboards/test-widget-source.use-case.ts';
import { UpdateDashboardUseCase } from '../../application/dashboards/update-dashboard.use-case.ts';
import { UpdateLayoutUseCase } from '../../application/dashboards/update-layout.use-case.ts';
import { UpdateWidgetUseCase } from '../../application/dashboards/update-widget.use-case.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import {
  type DashboardDraftQuery,
  DashboardDraftQuerySchema,
  type PutWidgetStateBody,
  PutWidgetStateBodySchema,
  type UpdateWidgetControllerBody,
  UpdateWidgetControllerBodySchema,
  type UpsertWidgetControllerBody,
  UpsertWidgetControllerBodySchema,
} from './dashboards.body.ts';

@Controller('orgs/:orgId/dashboards')
@UseGuards(OrgAccessGuard)
export class DashboardsController {
  constructor(
    private readonly listDashboards: ListDashboardsUseCase,
    private readonly createDashboard: CreateDashboardUseCase,
    private readonly getDashboard: GetDashboardUseCase,
    private readonly getDashboardsCatalog: GetDashboardsCatalogUseCase,
    private readonly updateDashboard: UpdateDashboardUseCase,
    private readonly deleteDashboard: DeleteDashboardUseCase,
    private readonly createWidget: CreateWidgetUseCase,
    private readonly updateWidget: UpdateWidgetUseCase,
    private readonly deleteWidget: DeleteWidgetUseCase,
    private readonly updateLayout: UpdateLayoutUseCase,
    private readonly activateWidget: ActivateWidgetUseCase,
    private readonly invokeWidgetSource: InvokeWidgetSourceUseCase,
    private readonly testWidgetSource: TestWidgetSourceUseCase,
    private readonly getWidgetState: GetWidgetStateUseCase,
    private readonly putWidgetState: PutWidgetStateUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): DashboardListResponse {
    return this.listDashboards.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateDashboardBodySchema) body: CreateDashboardBody,
  ): { id: string } {
    return this.createDashboard.execute({ orgId, body });
  }

  @Post('source-test')
  sourceTest(
    @Param('orgId') orgId: string,
    @Body(WidgetSourceTestBodySchema) body: WidgetSourceTestBody,
  ): Promise<WidgetInvokeOutcome> {
    return this.testWidgetSource.execute({ orgId, body });
  }

  @Get('catalog')
  catalog(): DashboardsCatalogResponse {
    return this.getDashboardsCatalog.execute();
  }

  @Get(':dashboardId')
  detail(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
  ): DashboardDetail {
    return this.getDashboard.execute({ orgId, dashboardId });
  }

  @Patch(':dashboardId')
  update(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Body(UpdateDashboardBodySchema) body: UpdateDashboardBody,
  ): DashboardDetail {
    return this.updateDashboard.execute({ orgId, dashboardId, body });
  }

  @Delete(':dashboardId')
  remove(@Param('orgId') orgId: string, @Param('dashboardId') dashboardId: string): { ok: true } {
    this.deleteDashboard.execute({ orgId, dashboardId });
    return { ok: true };
  }

  @Post(':dashboardId/widgets')
  @HttpCode(201)
  addWidget(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Query(DashboardDraftQuerySchema) query: DashboardDraftQuery,
    @Body(UpsertWidgetControllerBodySchema) body: UpsertWidgetControllerBody,
  ): { widgetId: string } {
    return this.createWidget.execute({
      orgId,
      dashboardId,
      body,
      status: widgetStatusOf(query.draft, body.createdByAgent),
      ...(body.createdByAgent ? { createdBy: 'agent' } : {}),
    });
  }

  @Patch(':dashboardId/widgets/:widgetId')
  patchWidget(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body(UpdateWidgetControllerBodySchema) body: UpdateWidgetControllerBody,
  ): DashboardWidget {
    const { baseUpdatedAt, ...patch } = body;
    return this.updateWidget.execute({
      orgId,
      dashboardId,
      widgetId,
      body: patch,
      ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
    });
  }

  @Get(':dashboardId/widgets/:widgetId/state')
  widgetState(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ): WidgetStateSnapshot {
    return this.getWidgetState.execute({ orgId, dashboardId, widgetId });
  }

  @Put(':dashboardId/widgets/:widgetId/state')
  writeWidgetState(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body(PutWidgetStateBodySchema) body: PutWidgetStateBody,
  ): WidgetStateSnapshot {
    return this.putWidgetState.execute({ orgId, dashboardId, widgetId, state: body.state });
  }

  @Delete(':dashboardId/widgets/:widgetId')
  removeWidget(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ): { ok: true } {
    this.deleteWidget.execute({ orgId, dashboardId, widgetId });
    return { ok: true };
  }

  @Put(':dashboardId/layout')
  layout(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Body(UpdateLayoutBodySchema) body: UpdateLayoutBody,
  ): { ok: true } {
    return this.updateLayout.execute({ orgId, dashboardId, items: body.items });
  }

  @Post(':dashboardId/widgets/:widgetId/activate')
  activate(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ): DashboardWidget {
    return this.activateWidget.execute({ orgId, dashboardId, widgetId });
  }

  @Post(':dashboardId/widgets/:widgetId/invoke')
  invoke(
    @Param('orgId') orgId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body(WidgetInvokeBodySchema) body: WidgetInvokeBody,
  ): Promise<WidgetInvokeOutcome> {
    return this.invokeWidgetSource.execute({ orgId, dashboardId, widgetId, body });
  }
}

interface WidgetInvokeOutcome {
  ok: boolean;
  status?: number;
  json?: unknown;
  fetchedAt?: string;
  cacheHit?: boolean;
  error?: string;
}

function widgetStatusOf(draft: string | undefined, createdByAgent: boolean | undefined) {
  if (draft === 'true' || createdByAgent === true) {
    return 'draft' as const;
  }
  return 'active' as const;
}
