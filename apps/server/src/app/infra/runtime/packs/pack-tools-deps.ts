import type { OrgRuntimeDeps } from '../org-runtime.types.ts';
import { githubToolsDeps } from './github-tools.holder.ts';
import { googleToolsDeps } from './google-tools.holder.ts';
import { issueToolsDeps } from './issue-tools.holder.ts';
import { managerToolsDeps } from './manager-tools.holder.ts';
import { skillsToolsDeps } from './skills-tools.holder.ts';
import { telegramToolsDeps } from './telegram-tools.holder.ts';

export function packToolsDeps(): Pick<
  OrgRuntimeDeps,
  'issues' | 'manager' | 'skills' | 'google' | 'github' | 'telegram'
> {
  return {
    issues: issueToolsDeps(),
    manager: managerToolsDeps(),
    skills: skillsToolsDeps(),
    google: googleToolsDeps(),
    github: githubToolsDeps(),
    telegram: telegramToolsDeps(),
  };
}
