import type { OrgSkillsDeps } from './org-skills.pack.port.ts';

let current: OrgSkillsDeps | undefined;

export function setSkillsToolsDeps(deps: OrgSkillsDeps): void {
  current = deps;
}

export function skillsToolsDeps(): OrgSkillsDeps | undefined {
  return current;
}
