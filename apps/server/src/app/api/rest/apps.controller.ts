import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@harnesys/brix';
import type {
  AppResponse,
  AppsListQuery,
  AppsListResponse,
  CreateAppBody,
  UpdateAppBody,
} from '@harnesys/contracts';
import { AppsListQuerySchema, CreateAppBodySchema, UpdateAppBodySchema } from '@harnesys/contracts';
import { CreateAppUseCase } from '../../application/apps/create-app.use-case.ts';
import { DeleteAppUseCase } from '../../application/apps/delete-app.use-case.ts';
import { GetAppUseCase, ListAppsUseCase } from '../../application/apps/list-apps.use-case.ts';
import { UpdateAppUseCase } from '../../application/apps/update-app.use-case.ts';

@Controller('orgs/:orgId/apps')
export class AppsController {
  constructor(
    private readonly listApps: ListAppsUseCase,
    private readonly getApp: GetAppUseCase,
    private readonly createApp: CreateAppUseCase,
    private readonly updateApp: UpdateAppUseCase,
    private readonly deleteApp: DeleteAppUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(AppsListQuerySchema) query: AppsListQuery,
  ): Promise<AppsListResponse> {
    return this.listApps.execute({ orgId, ...query });
  }

  @Post()
  create(
    @Param('orgId') orgId: string,
    @Body(CreateAppBodySchema) body: CreateAppBody,
  ): Promise<AppResponse> {
    return this.createApp.execute({ orgId, ...body });
  }

  @Get(':appId')
  get(@Param('orgId') orgId: string, @Param('appId') appId: string): Promise<AppResponse> {
    return this.getApp.execute({ orgId, appId });
  }

  @Patch(':appId')
  update(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
    @Body(UpdateAppBodySchema) body: UpdateAppBody,
  ): Promise<AppResponse> {
    return this.updateApp.execute({ orgId, appId, ...body });
  }

  @Delete(':appId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('appId') appId: string): Promise<void> {
    return this.deleteApp.execute({ orgId, appId });
  }
}
