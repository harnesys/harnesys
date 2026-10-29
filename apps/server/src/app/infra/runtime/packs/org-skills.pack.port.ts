import type { SkillCandidate } from '@harnesys/contracts';
import type {
  SkillsCreateSkillInput,
  SkillsInstallSkillInput,
  SkillsPackPorts,
} from 'harnesys/skills';
import { CreateOrgSkillUseCase } from '../../../application/skills/create-org-skill.use-case.ts';
import { DiscoverRepoSkillsUseCase } from '../../../application/skills/discover-repo-skills.use-case.ts';
import { InstallRepoSkillsUseCase } from '../../../application/skills/install-repo-skills.use-case.ts';
import { SearchSkillsUseCase } from '../../../application/skills/search-skills.use-case.ts';
import {
  resolveSkillSelection,
  skillSelectionError,
} from '../../../application/skills/skill-selection.ts';
import { SkillValidationException } from '../../../domain/skills/skills.error.ts';
import { getHostToolScope } from '../host-tool-scope.ts';

export interface OrgSkillsDeps {
  createSkill: CreateOrgSkillUseCase;
  discover: DiscoverRepoSkillsUseCase;
  install: InstallRepoSkillsUseCase;
  search: SearchSkillsUseCase;
}

export class OrgSkillsPackPort implements SkillsPackPorts {
  constructor(private readonly deps: OrgSkillsDeps) {}

  async createSkill(input: SkillsCreateSkillInput): Promise<{ name: string }> {
    const result = await this.deps.createSkill.execute({
      orgId: input.orgId,
      body: input.body,
    });
    return { name: result.skill.name };
  }

  async installSkill(
    input: SkillsInstallSkillInput,
  ): Promise<{ installed: string[]; candidates?: string[] }> {
    const body = { url: input.source, ...(input.ref !== undefined ? { ref: input.ref } : {}) };
    const discovered = await this.deps.discover.execute({ orgId: input.orgId, body });
    const selections = resolveInstallSelections(discovered.candidates, input);
    if (selections === null) {
      return { installed: [], candidates: discovered.candidates.map((c) => c.name) };
    }
    const installed = await this.deps.install.execute({
      orgId: input.orgId,
      body: { ...body, revision: discovered.revision, selections },
    });
    return { installed: installed.installed.map((skill) => skill.name) };
  }

  searchSkills(query: string) {
    return this.deps.search.execute({ query });
  }

  resolveOrgId(): string | undefined {
    return getHostToolScope()?.orgId;
  }
}

function resolveInstallSelections(
  candidates: SkillCandidate[],
  input: Pick<SkillsInstallSkillInput, 'skill' | 'all'>,
): string[] | null {
  if (input.all === true) {
    return candidates.map((c) => c.subPath);
  }
  if (input.skill !== undefined) {
    const resolved = resolveSkillSelection(candidates, input.skill);
    if (!resolved.ok) {
      throw new SkillValidationException(skillSelectionError(input.skill, resolved));
    }
    return [resolved.subPath];
  }
  const only = candidates.length === 1 ? candidates[0] : undefined;
  return only ? [only.subPath] : null;
}
