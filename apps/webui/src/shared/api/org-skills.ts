import type {
  CreateOrgSkillBody,
  CreateOrgSkillResponse,
  DiscoverSkillsBody,
  DiscoverSkillsResponse,
  InstallSkillsBody,
  InstallSkillsResponse,
  ListEffectiveSkillsResponse,
  ListOrgSkillsResponse,
  OrgSettings,
  OrgSettingsPatch,
  SkillSearchResponse,
} from '@harnesys/contracts';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiJson } from './client';
import { watchSkillsChanged } from './events';

export type {
  CreateOrgSkillBody,
  CreateOrgSkillResponse,
  DiscoverSkillsBody,
  DiscoverSkillsResponse,
  InstallSkillsBody,
  InstallSkillsResponse,
  ListEffectiveSkillsResponse,
  ListOrgSkillsResponse,
  OrgSettings,
  OrgSettingsPatch,
  SkillSearchResponse,
};

function skillsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/skills`;
}

function orgBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}`;
}

export function orgSkillsQueryKey(orgId: string) {
  return ['orgs', orgId, 'skills'] as const;
}

export function effectiveSkillsQueryKey(orgId: string, agentId: string) {
  return ['orgs', orgId, 'skills', 'effective', agentId] as const;
}

export function orgSettingsQueryKey(orgId: string) {
  return ['orgs', orgId, 'settings'] as const;
}

export function listOrgSkills(orgId: string) {
  return apiJson<ListOrgSkillsResponse>(skillsBase(orgId));
}

export function orgSkillsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgSkillsQueryKey(orgId),
    queryFn: () => listOrgSkills(orgId),
    enabled: Boolean(orgId),
  });
}

export function effectiveSkills(orgId: string, agentId: string) {
  return apiJson<ListEffectiveSkillsResponse>(
    `${skillsBase(orgId)}/effective?agentId=${encodeURIComponent(agentId)}`,
  );
}

export function effectiveSkillsQuery(orgId: string, agentId: string) {
  return queryOptions({
    queryKey: effectiveSkillsQueryKey(orgId, agentId),
    queryFn: () => effectiveSkills(orgId, agentId),
    enabled: Boolean(orgId) && Boolean(agentId),
  });
}

export function getOrgSettings(orgId: string) {
  return apiJson<OrgSettings>(`${orgBase(orgId)}/settings`);
}

export function orgSettingsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgSettingsQueryKey(orgId),
    queryFn: () => getOrgSettings(orgId),
    enabled: Boolean(orgId),
  });
}

export function patchOrgSettings(orgId: string, patch: OrgSettingsPatch) {
  return apiJson<OrgSettings>(`${orgBase(orgId)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function createOrgSkill(orgId: string, body: CreateOrgSkillBody) {
  return apiJson<CreateOrgSkillResponse>(skillsBase(orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteOrgSkill(orgId: string, name: string) {
  return apiJson<void>(`${skillsBase(orgId)}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export function discoverSkills(orgId: string, body: DiscoverSkillsBody) {
  return apiJson<DiscoverSkillsResponse>(`${skillsBase(orgId)}/discover`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function installSkills(orgId: string, body: InstallSkillsBody) {
  return apiJson<InstallSkillsResponse>(`${skillsBase(orgId)}/install`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateInstalledSkill(orgId: string, name: string) {
  return apiJson<CreateOrgSkillResponse>(
    `${skillsBase(orgId)}/${encodeURIComponent(name)}/update`,
    {
      method: 'POST',
    },
  );
}

export function restoreSystemSkill(name: string) {
  return apiJson<CreateOrgSkillResponse>(
    `/api/host/system-skills/${encodeURIComponent(name)}/restore`,
    { method: 'POST' },
  );
}

export function searchSkills(query: string) {
  return apiJson<SkillSearchResponse>(`/api/skills/search?q=${encodeURIComponent(query)}`);
}

export function reloadOrgSkills(orgId: string) {
  return apiJson<ListOrgSkillsResponse>(`${skillsBase(orgId)}/reload`, {
    method: 'POST',
  });
}

export function useSkillsChangedWatch(orgId: string, onEvent?: () => void) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchSkillsChanged((frame) => {
      if (frame.orgId !== orgId) {
        return;
      }
      if (onEvent) {
        onEvent();
        return;
      }
      void queryClient.invalidateQueries({ queryKey: orgSkillsQueryKey(orgId) });
    });
  }, [orgId, onEvent, queryClient]);
}
