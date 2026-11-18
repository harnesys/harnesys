import type { OrgRuntimeDeps } from '../org-runtime.types.ts';
import { issueToolsDeps } from './issue-tools.holder.ts';
import { managerToolsDeps } from './manager-tools.holder.ts';
import { skillsToolsDeps } from './skills-tools.holder.ts';
import { sourcesToolsDeps } from './sources-tools.holder.ts';

export function packToolsDeps(): Pick<
  OrgRuntimeDeps,
  'issues' | 'manager' | 'skills' | 'sourcesPack'
> {
  return {
    issues: issueToolsDeps(),
    manager: managerToolsDeps(),
    skills: skillsToolsDeps(),
    sourcesPack: sourcesToolsDeps(),
  };
}
