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
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type {
  ApprovePluginServerBody,
  InstallPluginBody,
  PluginListItem,
  PluginMutationResponse,
  SetPluginGrantsBody,
  SetPluginOptionBody,
  UpdatePluginBody,
};

function pluginsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/plugins`;
}

export function orgPluginsQueryKey(orgId: string) {
  return ['orgs', orgId, 'plugins'] as const;
}

export function listOrgPlugins(orgId: string) {
  return apiJson<PluginListItem[]>(pluginsBase(orgId));
}

export function orgPluginsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgPluginsQueryKey(orgId),
    queryFn: () => listOrgPlugins(orgId),
    enabled: Boolean(orgId),
  });
}

export function installOrgPlugin(orgId: string, body: InstallPluginBody) {
  return apiJson<PluginMutationResponse>(`${pluginsBase(orgId)}/install`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateOrgPlugin(orgId: string, name: string, body: UpdatePluginBody = {}) {
  return apiJson<PluginMutationResponse>(
    `${pluginsBase(orgId)}/${encodeURIComponent(name)}/update`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function setOrgPluginGrants(orgId: string, name: string, body: SetPluginGrantsBody) {
  return apiJson<PluginRecordResponse>(`${pluginsBase(orgId)}/${encodeURIComponent(name)}/grants`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function approveOrgPluginServer(orgId: string, name: string, body: ApprovePluginServerBody) {
  return apiJson<PluginRecordResponse>(
    `${pluginsBase(orgId)}/${encodeURIComponent(name)}/approvals`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function setOrgPluginOption(orgId: string, name: string, body: SetPluginOptionBody) {
  return apiJson<SetPluginOptionResponse>(
    `${pluginsBase(orgId)}/${encodeURIComponent(name)}/options`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export function removeOrgPlugin(orgId: string, name: string, deleteData = false) {
  const query = deleteData ? '?deleteData=true' : '';
  return apiJson<void>(`${pluginsBase(orgId)}/${encodeURIComponent(name)}${query}`, {
    method: 'DELETE',
  });
}
