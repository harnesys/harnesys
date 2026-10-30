import type { OrgLspListResponse } from '@harnesys/contracts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import type { OrgLspFile } from '../../infra/lsp/org-lsp-file.ts';
import {
  appendPluginServers,
  buildCatalog,
  type ListablePluginServer,
  toLspListResponse,
} from './lsp-status.ts';

export async function buildLspView(
  orgId: string,
  file: OrgLspFile,
  runtime: PluginRuntimePort,
  plugins: PluginRegistryPort,
  includeRaw: boolean,
): Promise<OrgLspListResponse> {
  const response = toLspListResponse(file, includeRaw);
  const bundle = await runtime.bundle(orgId);
  const disabledKeys = new Set(
    plugins
      .listDisabledServers(orgId)
      .map((entry) => `plugin:${entry.pluginName}:${entry.serverId}`),
  );
  const pluginServers: ListablePluginServer[] = bundle.lspServers.map((entry) => ({
    ...entry,
    granted: plugins.approvals(orgId, entry.plugin).includes(rawServerId(entry.serverId)),
    disabled: entry.disabled || disabledKeys.has(entry.serverId),
  }));
  appendPluginServers(response, pluginServers, file.servers);
  response.catalog = buildCatalog(file, response.servers);
  return response;
}

export function rawServerId(serverId: string): string {
  return serverId.split(':').slice(2).join(':');
}
