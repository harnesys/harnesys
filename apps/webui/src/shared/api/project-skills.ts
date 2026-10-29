import type { OrgSkill } from '@harnesys/contracts';
import type {
  ComponentStatus,
  CreateProjectSkillRequest,
  ProjectSkill,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { ApiError } from './client';
import { createOrgSkill, listOrgSkills, reloadOrgSkills } from './org-skills';
import { projectQueryKey, resolveOrgId } from './project-base';

export interface ProjectSkillsResponse {
  skills: ProjectSkill[];
}
export interface CreateProjectSkillResponse {
  skill: ProjectSkill;
}
export function projectSkillsQueryKey(projectId: string) {
  return [...projectQueryKey, projectId, 'skills'] as const;
}

function toProjectSkill(skill: OrgSkill): ProjectSkill {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
    origin:
      skill.origin.kind === 'plugin'
        ? {
            kind: 'plugin',
            pluginName: skill.origin.pluginName,
            status: (skill.origin.status ?? 'native') as ComponentStatus,
            ...(skill.origin.inertReason !== undefined
              ? { inertReason: skill.origin.inertReason }
              : {}),
          }
        : { kind: 'project' },
  };
}

export async function listProjectSkills(projectId: string): Promise<ProjectSkillsResponse> {
  const orgId = resolveOrgId(projectId);
  if (!orgId) {
    return { skills: [] };
  }
  const result = await listOrgSkills(orgId);
  return { skills: result.skills.map(toProjectSkill) };
}
export function projectSkillsQuery(projectId: string) {
  return queryOptions({
    queryKey: projectSkillsQueryKey(projectId),
    queryFn: () => listProjectSkills(projectId),
    staleTime: 20000,
  });
}
export function reloadProjectSkills(projectId: string): Promise<ProjectSkillsResponse> {
  const orgId = resolveOrgId(projectId);
  if (!orgId) {
    return Promise.resolve({ skills: [] });
  }
  return reloadOrgSkills(orgId).then((result) => ({ skills: result.skills.map(toProjectSkill) }));
}
export function createProjectSkill(
  projectId: string,
  body: CreateProjectSkillRequest,
): Promise<CreateProjectSkillResponse> {
  const orgId = resolveOrgId(projectId);
  if (!orgId) {
    return Promise.reject(new ApiError(400, 'no active org'));
  }
  return createOrgSkill(orgId, body).then((result) => ({ skill: toProjectSkill(result.skill) }));
}
