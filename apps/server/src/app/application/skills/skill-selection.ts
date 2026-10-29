import { basename } from 'node:path';
import type { SkillCandidate } from '@harnesys/contracts';

export type SkillSelectionResult =
  | { ok: true; subPath: string }
  | { ok: false; reason: 'ambiguous' | 'not-found'; candidates: string[] };

type SkillSelectionFailure = Extract<SkillSelectionResult, { ok: false }>;

export function skillSelectionError(selection: string, resolved: SkillSelectionFailure): string {
  const example = resolved.candidates[0] ?? '';
  return `cannot resolve skill "${selection}" (${resolved.reason}): ${resolved.candidates.join(', ')} — pass "skill" as the full subPath of one candidate, e.g. "${example}"`;
}

export function resolveSkillSelection(
  candidates: SkillCandidate[],
  skillId: string,
): SkillSelectionResult {
  const id = skillId.replace(/^\.\//, '').replace(/\/+$/, '');
  const bySubPath = candidates.filter((c) => c.subPath === id);
  if (bySubPath.length === 1) {
    return { ok: true, subPath: bySubPath[0]?.subPath ?? '' };
  }
  const bySuffix = candidates.filter((c) => id.endsWith(`/${c.subPath}`));
  if (bySuffix.length === 1) {
    return { ok: true, subPath: bySuffix[0]?.subPath ?? '' };
  }
  const byBasename = candidates.filter((c) => basename(c.subPath) === id);
  if (byBasename.length === 1) {
    return { ok: true, subPath: byBasename[0]?.subPath ?? '' };
  }
  if (byBasename.length > 1) {
    return { ok: false, reason: 'ambiguous', candidates: byBasename.map((c) => c.subPath) };
  }
  const byName = candidates.filter((c) => c.name === id);
  if (byName.length === 1) {
    return { ok: true, subPath: byName[0]?.subPath ?? '' };
  }
  if (byName.length > 1) {
    return { ok: false, reason: 'ambiguous', candidates: byName.map((c) => c.subPath) };
  }
  return { ok: false, reason: 'not-found', candidates: candidates.map((c) => c.subPath) };
}
