import { Injectable } from '@harnesys/brix';
import { McpValidationException } from '../../domain/mcp/mcp.error.ts';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

export interface DeleteOrgMcpServerRequest {
  orgId: string;
  serverId: string;
}

@Injectable()
export class DeleteOrgMcpServerUseCase {
  constructor(
    private readonly mcp: OrgMcpPort,
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: DeleteOrgMcpServerRequest): Promise<void> {
    if (request.serverId.startsWith('plugin:')) {
      throw new McpValidationException(`mcp server ${request.serverId} belongs to a plugin`);
    }
    this.mcp.remove(request.orgId, request.serverId);
    this.pluginRuntime.invalidate(request.orgId);
    await this.executor.invalidateRuntime(request.orgId);
  }
}
