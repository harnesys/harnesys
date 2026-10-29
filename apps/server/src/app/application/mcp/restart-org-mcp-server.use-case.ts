import { Injectable } from '@harnesys/brix';
import type { ListOrgMcpConfigResponse } from '@harnesys/contracts';
import { McpServerNotFoundException } from '../../domain/mcp/mcp.error.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { GetOrgMcpConfigUseCase } from './get-org-mcp-config.use-case.ts';

export interface RestartOrgMcpServerRequest {
  orgId: string;
  serverId: string;
}

@Injectable()
export class RestartOrgMcpServerUseCase {
  constructor(
    private readonly executor: LocalExecutorPort,
    private readonly getConfig: GetOrgMcpConfigUseCase,
  ) {}

  async execute(request: RestartOrgMcpServerRequest): Promise<ListOrgMcpConfigResponse> {
    const config = await this.getConfig.execute({ orgId: request.orgId });
    if (!config.servers.some((server) => server.serverId === request.serverId)) {
      throw new McpServerNotFoundException(request.serverId);
    }
    await this.executor.invalidateRuntime(request.orgId);
    return this.getConfig.execute({ orgId: request.orgId });
  }
}
