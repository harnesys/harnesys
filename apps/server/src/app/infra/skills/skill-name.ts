import { SkillValidationException } from '../../domain/skills/skills.error.ts';

export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function sanitizeSkillName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  if (!SKILL_NAME_RE.test(slug)) {
    throw new SkillValidationException(`cannot derive skill name from: ${raw}`);
  }
  return slug;
}
