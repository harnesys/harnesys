import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@harnesys/brix';
import type {
  ApprovePluginServerBody,
  InstallPluginBody,
  PluginListItem,
  PluginMutationResponse,
  PluginRecordResponse,
  SetPluginGrantsBody,
  SetPluginOptionBody,
  SetPluginOptionResponse,
  UpdatePluginBody,
} from '@harnesys/contracts';
import {
  ApprovePluginServerBodySchema,
  InstallPluginBodySchema,
  SetPluginGrantsBodySchema,
  SetPluginOptionBodySchema,
  UpdatePluginBodySchema,
} from '@harnesys/contracts';
import { z } from 'zod';
import { ApprovePluginServerUseCase } from '../../application/plugins/approve-plugin-server.use-case.ts';
import { InstallPluginUseCase } from '../../application/plugins/install-plugin.use-case.ts';
import { ListPluginsUseCase } from '../../application/plugins/list-plugins.use-case.ts';
import { RemovePluginUseCase } from '../../application/plugins/remove-plugin.use-case.ts';
import { SetPluginGrantsUseCase } from '../../application/plugins/set-plugin-grants.use-case.ts';
import { SetPluginOptionUseCase } from '../../application/plugins/set-plugin-option.use-case.ts';
import { UpdatePluginUseCase } from '../../application/plugins/update-plugin.use-case.ts';

const RemovePluginQuerySchema = z.object({
  deleteData: z.enum(['true', '1', 'false', '0']).optional(),
});

@Controller('orgs/:orgId/plugins')
export class PluginsController {
  constructor(
    private readonly listPlugins: ListPluginsUseCase,
    private readonly installPlugin: InstallPluginUseCase,
    private readonly updatePlugin: UpdatePluginUseCase,
    private readonly setGrants: SetPluginGrantsUseCase,
    private readonly approveServer: ApprovePluginServerUseCase,
    private readonly setOption: SetPluginOptionUseCase,
    private readonly removePlugin: RemovePluginUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): Promise<PluginListItem[]> {
    return this.listPlugins.execute({ orgId });
  }

  @Post('install')
  @HttpCode(201)
  install(
    @Param('orgId') orgId: string,
    @Body(InstallPluginBodySchema) body: InstallPluginBody,
  ): Promise<PluginMutationResponse> {
    return this.installPlugin.execute({ orgId, body });
  }

  @Post(':name/update')
  update(
    @Param('orgId') orgId: string,
    @Param('name') name: string,
    @Body(UpdatePluginBodySchema) body: UpdatePluginBody,
  ): Promise<PluginMutationResponse> {
    return this.updatePlugin.execute({ orgId, name, body });
  }

  @Put(':name/grants')
  grants(
    @Param('orgId') orgId: string,
    @Param('name') name: string,
    @Body(SetPluginGrantsBodySchema) body: SetPluginGrantsBody,
  ): Promise<PluginRecordResponse> {
    return this.setGrants.execute({ orgId, name, body });
  }

  @Post(':name/approvals')
  @HttpCode(201)
  approvals(
    @Param('orgId') orgId: string,
    @Param('name') name: string,
    @Body(ApprovePluginServerBodySchema) body: ApprovePluginServerBody,
  ): Promise<PluginRecordResponse> {
    return this.approveServer.execute({ orgId, name, body });
  }

  @Put(':name/options')
  options(
    @Param('orgId') orgId: string,
    @Param('name') name: string,
    @Body(SetPluginOptionBodySchema) body: SetPluginOptionBody,
  ): Promise<SetPluginOptionResponse> {
    return this.setOption.execute({ orgId, name, body });
  }

  @Delete(':name')
  @HttpCode(204)
  remove(
    @Param('orgId') orgId: string,
    @Param('name') name: string,
    @Query(RemovePluginQuerySchema) query: z.infer<typeof RemovePluginQuerySchema>,
  ): Promise<void> {
    const deleteData = query.deleteData === 'true' || query.deleteData === '1';
    return this.removePlugin.execute({
      orgId,
      name,
      ...(deleteData ? { deleteData: true } : {}),
    });
  }
}
