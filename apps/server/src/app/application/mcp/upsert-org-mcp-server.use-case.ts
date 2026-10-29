import { Injectable } from '@harnesys/brix';
import type { UpsertOrgMcpServerBody, UpsertOrgMcpServerResponse } from '@harnesys/contracts';
import { McpValidationException } from '../../domain/mcp/mcp.error.ts';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

export interface UpsertOrgMcpServerRequest {
  orgId: string;
  serverId: string;
  body: UpsertOrgMcpServerBody;
}

@Injectable()
export class UpsertOrgMcpServerUseCase {
  constructor(
    private readonly mcp: OrgMcpPort,
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: UpsertOrgMcpServerRequest): Promise<UpsertOrgMcpServerResponse> {
    if (request.serverId.startsWith('plugin:')) {
      throw new McpValidationException(`mcp server ${request.serverId} belongs to a plugin`);
    }
    const server = this.mcp.upsert(request.orgId, request.serverId, request.body);
    this.pluginRuntime.invalidate(request.orgId);
    const live = await this.executor.listMcpServers(request.orgId);
    const snap = server.enabled
      ? live.find((entry) => entry.serverId === server.serverId)
      : undefined;
    return {
      server: {
        ...server,
        connected: server.enabled && (snap?.connected ?? false),
        toolCount: server.enabled ? (snap?.tools.length ?? 0) : 0,
      },
    };
  }
}
