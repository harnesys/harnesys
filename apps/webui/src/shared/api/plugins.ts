import type {
  ApprovePluginServerBody,
  InstallPluginBody,
  PluginListItem as OrgPluginListItem,
  PluginMutationResponse as OrgPluginMutationResponse,
  PluginSummary as OrgPluginSummary,
  PluginRecordResponse,
  SetPluginGrantsBody,
  SetPluginOptionBody,
  SetPluginOptionResponse,
  UpdatePluginBody,
} from '@harnesys/contracts';
import type {
  ApprovePluginServerRequest,
  InstallPluginRequest,
  PluginComponentSummary,
  PluginDiagnostic,
  PluginListItem,
  PluginMutationResponse,
  PluginRecord,
  PluginSourceFormat,
  PluginSummary,
  RemovePluginRequest,
  SetPluginGrantsRequest,
  SetPluginOptionRequest,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type {
  ApprovePluginServerRequest,
  InstallPluginRequest,
  PluginDiagnostic,
  PluginListItem,
  PluginMutationResponse,
  PluginRecord,
  PluginSummary,
  RemovePluginRequest,
  SetPluginGrantsRequest,
  SetPluginOptionRequest,
};

export const pluginsQueryKey = ['plugins'] as const;
export function pluginsQueryKeyFor(orgId: string) {
  return [...pluginsQueryKey, orgId] as const;
}

function pluginsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/plugins`;
}

export function listPlugins(orgId: string) {
  return apiJson<OrgPluginListItem[]>(pluginsBase(orgId)).then((items) => items.map(toStudioItem));
}

export function pluginsQuery(orgId: string) {
  return queryOptions({
    queryKey: pluginsQueryKeyFor(orgId),
    queryFn: () => listPlugins(orgId),
    enabled: Boolean(orgId),
    staleTime: 20000,
  });
}

export function installPlugin(orgId: string, body: InstallPluginRequest) {
  return apiJson<OrgPluginMutationResponse>(`${pluginsBase(orgId)}/install`, {
    method: 'POST',
    body: JSON.stringify(toInstallBody(body)),
  }).then(toStudioMutation);
}

export function updatePlugin(
  orgId: string,
  name: string,
  body: {
    ref?: string;
  } = {},
) {
  const payload: UpdatePluginBody = body.ref !== undefined ? { ref: body.ref } : {};
  return apiJson<OrgPluginMutationResponse>(
    `${pluginsBase(orgId)}/${encodeURIComponent(name)}/update`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  ).then(toStudioMutation);
}

export function setPluginGrants(orgId: string, name: string, body: SetPluginGrantsRequest) {
  const payload: SetPluginGrantsBody = { classes: body.classes };
  return apiJson<PluginRecordResponse>(`${pluginsBase(orgId)}/${encodeURIComponent(name)}/grants`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then((result) => ({ plugin: toStudioSummary(result.plugin) }));
}

export function approvePluginServer(orgId: string, name: string, body: ApprovePluginServerRequest) {
  const payload: ApprovePluginServerBody = { serverId: body.serverId };
  return apiJson<PluginRecordResponse>(
    `${pluginsBase(orgId)}/${encodeURIComponent(name)}/approvals`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  ).then((result) => ({ plugin: toStudioSummary(result.plugin) }));
}

export function setPluginOption(orgId: string, name: string, body: SetPluginOptionRequest) {
  const payload: SetPluginOptionBody = { key: body.key, value: body.value };
  return apiJson<SetPluginOptionResponse>(
    `${pluginsBase(orgId)}/${encodeURIComponent(name)}/options`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  ).then((result) => ({
    plugin: toStudioSummary(result.plugin),
    diagnostics: result.diagnostics as PluginDiagnostic[],
  }));
}

export function removePlugin(orgId: string, name: string, body: RemovePluginRequest = {}) {
  const query = body.deleteData ? '?deleteData=true' : '';
  return apiJson<void>(`${pluginsBase(orgId)}/${encodeURIComponent(name)}${query}`, {
    method: 'DELETE',
  });
}

function toInstallBody(body: InstallPluginRequest): InstallPluginBody {
  return {
    ...(body.source !== undefined ? { source: body.source } : {}),
    ...(body.path !== undefined ? { path: body.path } : {}),
    ...(body.ref !== undefined ? { ref: body.ref } : {}),
    ...(body.pluginName !== undefined ? { pluginName: body.pluginName } : {}),
    ...(body.registryId !== undefined ? { registryId: body.registryId } : {}),
  };
}

function toStudioMutation(result: OrgPluginMutationResponse): PluginMutationResponse {
  return {
    plugin: toStudioSummary(result.plugin),
    diagnostics: result.diagnostics as PluginDiagnostic[],
  };
}

function toStudioItem(item: OrgPluginListItem): PluginListItem {
  return {
    plugin: toStudioSummary(item.plugin),
    diagnostics: item.diagnostics as PluginDiagnostic[],
  };
}

function toStudioSummary(plugin: OrgPluginSummary): PluginSummary {
  return {
    projectId: plugin.orgId,
    name: plugin.name,
    source: plugin.source,
    revision: plugin.revision,
    path: plugin.path,
    dataPath: plugin.dataPath,
    format: plugin.format as PluginSourceFormat | 'unknown',
    grants: plugin.grants,
    options: plugin.options,
    ...(plugin.registryId !== undefined ? { registryId: plugin.registryId } : {}),
    ...(plugin.catalogPluginName !== undefined
      ? { catalogPluginName: plugin.catalogPluginName }
      : {}),
    installedAt: plugin.installedAt,
    updatedAt: plugin.updatedAt,
    ...(plugin.version !== undefined ? { version: plugin.version } : {}),
    ...(plugin.description !== undefined ? { description: plugin.description } : {}),
    components: plugin.components as PluginComponentSummary[],
    skillCount: plugin.skillCount,
    hookCount: plugin.hookCount,
    mcpServerCount: plugin.mcpServerCount,
    agentCount: plugin.agentCount,
    commandCount: plugin.commandCount,
    lspServerCount: plugin.lspServerCount,
  };
}
