import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@harnesys/brix';
import type {
  ListOrgMcpConfigResponse,
  ListOrgMcpResponse,
  SetOrgMcpServerStateBody,
  UpsertOrgMcpServerBody,
  UpsertOrgMcpServerResponse,
} from '@harnesys/contracts';
import { SetOrgMcpServerStateBodySchema, UpsertOrgMcpServerBodySchema } from '@harnesys/contracts';
import { DeleteOrgMcpServerUseCase } from '../../application/mcp/delete-org-mcp-server.use-case.ts';
import { GetOrgMcpUseCase } from '../../application/mcp/get-org-mcp.use-case.ts';
import { GetOrgMcpConfigUseCase } from '../../application/mcp/get-org-mcp-config.use-case.ts';
import { ReloadOrgMcpUseCase } from '../../application/mcp/reload-org-mcp.use-case.ts';
import { RestartOrgMcpServerUseCase } from '../../application/mcp/restart-org-mcp-server.use-case.ts';
import { SetOrgMcpServerStateUseCase } from '../../application/mcp/set-org-mcp-server-state.use-case.ts';
import { UpsertOrgMcpServerUseCase } from '../../application/mcp/upsert-org-mcp-server.use-case.ts';

@Controller('orgs/:orgId/mcp')
export class McpController {
  constructor(
    private readonly getMcp: GetOrgMcpUseCase,
    private readonly getConfig: GetOrgMcpConfigUseCase,
    private readonly upsertServer: UpsertOrgMcpServerUseCase,
    private readonly deleteServer: DeleteOrgMcpServerUseCase,
    private readonly setState: SetOrgMcpServerStateUseCase,
    private readonly reloadMcp: ReloadOrgMcpUseCase,
    private readonly restartServer: RestartOrgMcpServerUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): Promise<ListOrgMcpResponse> {
    return this.getMcp.execute({ orgId });
  }

  @Get('config')
  config(@Param('orgId') orgId: string): Promise<ListOrgMcpConfigResponse> {
    return this.getConfig.execute({ orgId });
  }

  @Post('reload')
  reload(@Param('orgId') orgId: string): Promise<ListOrgMcpConfigResponse> {
    return this.reloadMcp.execute({ orgId });
  }

  @Put('servers/:serverId')
  upsert(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
    @Body(UpsertOrgMcpServerBodySchema) body: UpsertOrgMcpServerBody,
  ): Promise<UpsertOrgMcpServerResponse> {
    return this.upsertServer.execute({ orgId, serverId, body });
  }

  @Delete('servers/:serverId')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('serverId') serverId: string): Promise<void> {
    return this.deleteServer.execute({ orgId, serverId });
  }

  @Put('servers/:serverId/state')
  state(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
    @Body(SetOrgMcpServerStateBodySchema) body: SetOrgMcpServerStateBody,
  ): Promise<ListOrgMcpConfigResponse> {
    return this.setState.execute({ orgId, serverId, enabled: body.enabled });
  }

  @Post('servers/:serverId/restart')
  restart(
    @Param('orgId') orgId: string,
    @Param('serverId') serverId: string,
  ): Promise<ListOrgMcpConfigResponse> {
    return this.restartServer.execute({ orgId, serverId });
  }
}
