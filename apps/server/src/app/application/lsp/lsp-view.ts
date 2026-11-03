import type { OrgLspListResponse } from '@harnesys/contracts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import type { OrgLspFile } from '../../infra/lsp/org-lsp-file.ts';
import {
  appendPluginServers,
  buildCatalog,
  type HasBinary,
  type ListablePluginServer,
  toLspListResponse,
} from './lsp-status.ts';

export interface BuildLspViewInput {
  orgId: string;
  file: OrgLspFile;
  runtime: PluginRuntimePort;
  plugins: PluginRegistryPort;
  includeRaw: boolean;
  hasBinary: HasBinary;
}

export async function buildLspView(input: BuildLspViewInput): Promise<OrgLspListResponse> {
  const { orgId, file, runtime, plugins, includeRaw, hasBinary } = input;
  const response = toLspListResponse(file, includeRaw, hasBinary);
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
  appendPluginServers(response, pluginServers, file.servers, hasBinary);
  response.catalog = buildCatalog(file, response.servers, hasBinary);
  return response;
}

export function rawServerId(serverId: string): string {
  return serverId.split(':').slice(2).join(':');
}
