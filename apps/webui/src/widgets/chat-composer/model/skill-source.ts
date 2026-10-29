import { useQuery } from '@tanstack/react-query';
import { useSelectedAgent } from '@/features/desk';
import { getActiveOrgId } from '@/shared/api/active-org';
import { effectiveSkillsQuery } from '@/shared/api/org-skills';
import { isValidEntityRef } from './entity-kinds';
export interface SkillOption {
  name: string;
  description: string;
}
export interface ComposerSkillOptions {
  options: SkillOption[];
  loading: boolean;
}
export function useComposerSkillOptions(): ComposerSkillOptions {
  const agent = useSelectedAgent();
  const orgId = getActiveOrgId();
  const skillsQuery = useQuery({
    ...effectiveSkillsQuery(orgId ?? '', agent?.id ?? ''),
    enabled: Boolean(orgId) && Boolean(agent?.id),
  });
  const options = (skillsQuery.data?.skills ?? [])
    .filter((skill) => skill.loadable && isValidEntityRef('skill', skill.name))
    .map((skill) => ({ name: skill.name, description: skill.description }));
  return { options, loading: skillsQuery.isPending };
}
