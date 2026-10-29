import type { OrgSkill } from '@harnesys/contracts';

export interface ValidateRequestedSkillsInput {
  requested: string[];
  catalog: OrgSkill[];
}

export type ValidateRequestedSkillsResult = { ok: string[] } | { error: string };

export function requestedSkillsBlock(names: string[]): string {
  const escaped = names.map((name) => name.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`));
  return `<requested-skills names="${escaped.join(', ')}">\nLoad each listed skill with the load_skill tool before answering.\n</requested-skills>`;
}

export function validateRequestedSkills(
  input: ValidateRequestedSkillsInput,
): ValidateRequestedSkillsResult {
  const unique = [...new Set(input.requested)];
  const byName = new Map(input.catalog.map((skill) => [skill.name, skill]));
  const invalid = unique.filter((name) => byName.get(name)?.loadable !== true);
  if (invalid.length > 0) {
    return { error: `requested skills are not available: ${invalid.join(', ')}` };
  }
  return { ok: unique };
}
