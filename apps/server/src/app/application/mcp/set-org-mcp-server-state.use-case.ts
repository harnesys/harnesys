import { Injectable } from '@harnesys/brix';
import type { ListOrgMcpConfigResponse } from '@harnesys/contracts';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { GetOrgMcpConfigUseCase } from './get-org-mcp-config.use-case.ts';

export interface SetOrgMcpServerStateRequest {
  orgId: string;
  serverId: string;
  enabled: boolean;
}

@Injectable()
export class SetOrgMcpServerStateUseCase {
  constructor(
    private readonly mcp: OrgMcpPort,
    private readonly plugins: PluginRegistryPort,
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly executor: LocalExecutorPort,
    private readonly getConfig: GetOrgMcpConfigUseCase,
  ) {}

  async execute(request: SetOrgMcpServerStateRequest): Promise<ListOrgMcpConfigResponse> {
    const scoped = parsePluginServerId(request.serverId);
    if (scoped === undefined) {
      this.mcp.setEnabled(request.orgId, request.serverId, request.enabled);
    } else {
      this.plugins.setServerDisabled(
        scoped.pluginName,
        scoped.serverId,
        request.orgId,
        !request.enabled,
      );
    }
    this.pluginRuntime.invalidate(request.orgId);
    await this.executor.invalidateRuntime(request.orgId);
    return this.getConfig.execute({ orgId: request.orgId });
  }
}

interface PluginServerRef {
  pluginName: string;
  serverId: string;
}

function parsePluginServerId(serverId: string): PluginServerRef | undefined {
  if (!serverId.startsWith('plugin:')) {
    return undefined;
  }
  const rest = serverId.slice('plugin:'.length);
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator === rest.length - 1) {
    return undefined;
  }
  return {
    pluginName: rest.slice(0, separator),
    serverId: rest.slice(separator + 1),
  };
}
