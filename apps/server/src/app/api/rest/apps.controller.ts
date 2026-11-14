import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@harnesys/brix';
import type {
  AppResponse,
  AppsListQuery,
  AppsListResponse,
  CreateAppBody,
  UpdateAppBody,
} from '@harnesys/contracts';
import { AppsListQuerySchema, CreateAppBodySchema, UpdateAppBodySchema } from '@harnesys/contracts';
import { CreateAppUseCase } from '../../application/apps/apps/create-app.use-case.ts';
import { DeleteAppUseCase } from '../../application/apps/apps/delete-app.use-case.ts';
import { GetAppUseCase, ListAppsUseCase } from '../../application/apps/apps/list-app.use-case.ts';
import { UpdateAppUseCase } from '../../application/apps/apps/update-app.use-case.ts';
import { VerifyAppUseCase } from '../../application/apps/apps/verify-app.use-case.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import { appsResponse } from './apps-response.ts';

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/apps')
export class AppsController {
  constructor(
    private readonly listApps: ListAppsUseCase,
    private readonly getApp: GetAppUseCase,
    private readonly createApp: CreateAppUseCase,
    private readonly updateApp: UpdateAppUseCase,
    private readonly deleteApp: DeleteAppUseCase,
    private readonly verifyApp: VerifyAppUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(AppsListQuerySchema) query: AppsListQuery,
  ): AppsListResponse {
    return this.listApps.execute({ orgId, kind: query.kind });
  }

  @Post()
  create(@Param('orgId') orgId: string, @Body(CreateAppBodySchema) body: CreateAppBody) {
    return appsResponse(() => this.createApp.execute({ orgId, ...body }));
  }

  @Get(':appId')
  get(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
  ): Promise<AppResponse | Response> {
    return appsResponse(() => this.getApp.execute({ orgId, appId }));
  }

  @Patch(':appId')
  update(
    @Param('orgId') orgId: string,
    @Param('appId') appId: string,
    @Body(UpdateAppBodySchema) body: UpdateAppBody,
  ) {
    return appsResponse(() => this.updateApp.execute({ orgId, appId, ...body }));
  }

  @Delete(':appId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('appId') appId: string) {
    return appsResponse(() => this.deleteApp.execute({ orgId, appId }));
  }

  @Post(':appId/verify')
  @HttpCode(200)
  verify(@Param('orgId') orgId: string, @Param('appId') appId: string) {
    return appsResponse(() => this.verifyApp.execute({ orgId, appId }));
  }
}
