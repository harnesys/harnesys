import type {
  CreateProjectSkillRequest,
  PackCatalogEntry as ProjectCapability,
  ProjectMcpConfigServer,
  ProjectMcpServer,
  ProjectRecord,
  ProjectSkill,
  ProjectTool,
  UpsertProjectMcpServerRequest,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';
import { projectQueryKey, resolveOrgId } from './project-base';
import type { Source, SourceDistributionKind } from './sources';
import {
  attachLocalFolder,
  detachSource,
  listSources,
  renameSource,
  sourceBoundHostId,
  sourceDisplayPath,
} from './sources';

export * from './project-mcp';
export * from './project-skills';
export type {
  CreateProjectSkillRequest,
  ProjectCapability,
  ProjectMcpConfigServer,
  ProjectMcpServer,
  ProjectSkill,
  ProjectTool,
  UpsertProjectMcpServerRequest,
};
export { projectQueryKey, resolveOrgId };
export interface ProjectToolsResponse {
  tools: ProjectTool[];
}
export interface ProjectCapabilitiesResponse {
  capabilities: ProjectCapability[];
}

export type BridgedProject = ProjectRecord & {
  managed?: boolean;
  driver?: SourceDistributionKind;
  activeBranch?: string;
  hostId?: string;
  uiVisibility?: 'org' | 'host';
  hasGit: boolean;
  gitRemote: string | null;
};

function toBridgedProject(source: Source): BridgedProject {
  return {
    id: source.id,
    name: source.name,
    path: sourceDisplayPath(source),
    createdAt: source.createdAt,
    color: null,
    managed: source.managed,
    driver: source.distribution.kind,
    hostId: sourceBoundHostId(source) ?? undefined,
    uiVisibility: source.uiVisibility,
    activeBranch: source.vcs?.defaultBranch ?? undefined,
    hasGit: source.vcs !== null,
    gitRemote: source.vcs?.remoteUrl ?? null,
  };
}

export async function listProjects(): Promise<BridgedProject[]> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    return [];
  }
  const { sources } = await listSources(orgId);
  return sources.map(toBridgedProject);
}

export interface DirectoryEntry {
  name: string;
  path: string;
}
export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}
export function pickProjectFolder(): Promise<{ path: string } | undefined> {
  return Promise.reject(new ApiError(501, 'Native folder picker not available yet'));
}
export function browseProjectDirs(input: {
  path?: string;
  nodeId?: string;
}): Promise<DirectoryListing> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    return Promise.reject(new ApiError(400, 'No active org'));
  }
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/browse-dirs`, {
    method: 'POST',
    body: JSON.stringify({
      ...(input.path ? { path: input.path } : {}),
      ...(input.nodeId ? { hostId: input.nodeId } : {}),
    }),
  });
}
export function browseProjectDirsQuery(input: { path?: string; nodeId?: string }) {
  return queryOptions({
    queryKey: ['project-dirs', input.nodeId ?? 'self', input.path ?? ''],
    queryFn: () => browseProjectDirs(input),
  });
}
export async function createProject(input: {
  path?: string;
  name?: string;
  nodeId?: string;
}): Promise<BridgedProject> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  const path = input.path?.trim();
  if (!path) {
    throw new ApiError(400, 'Folder path is required');
  }
  const source = await attachLocalFolder(orgId, {
    absolutePath: path,
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    ...(input.nodeId ? { hostId: input.nodeId } : {}),
  });
  return toBridgedProject(source);
}
export async function updateProject(
  id: string,
  input: {
    name?: string;
    path?: string;
    color?: string | null;
  },
): Promise<BridgedProject> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  const name = input.name?.trim();
  if (!name) {
    throw new ApiError(400, 'Name is required');
  }
  const source = await renameSource(orgId, id, name);
  return toBridgedProject(source);
}
export async function deleteProject(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  await detachSource(orgId, id);
}
export async function wipeProject(
  id: string,
  _input: {
    wipeFolder?: boolean;
  } = {},
): Promise<void> {
  await deleteProject(id);
}
export const projectQuery = queryOptions({
  queryKey: projectQueryKey,
  queryFn: listProjects,
});
export function projectToolsQueryKey(projectId: string) {
  return [...projectQueryKey, projectId, 'tools'] as const;
}
export function listProjectTools(_projectId: string): Promise<ProjectToolsResponse> {
  return Promise.resolve({ tools: [] });
}
export function projectToolsQuery(projectId: string) {
  return queryOptions({
    queryKey: projectToolsQueryKey(projectId),
    queryFn: () => listProjectTools(projectId),
    staleTime: 20000,
  });
}
export function projectCapabilitiesQueryKey(projectId: string) {
  return [...projectQueryKey, projectId, 'capabilities'] as const;
}
export function listProjectCapabilities(_projectId: string): Promise<ProjectCapabilitiesResponse> {
  return Promise.resolve({ capabilities: [] });
}
export function projectCapabilitiesQuery(projectId: string) {
  return queryOptions({
    queryKey: projectCapabilitiesQueryKey(projectId),
    queryFn: () => listProjectCapabilities(projectId),
    staleTime: 20000,
  });
}
