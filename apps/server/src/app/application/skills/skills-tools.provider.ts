import { Injectable } from '@harnesys/brix';
import type { OrgSkillsDeps } from '../../infra/runtime/packs/org-skills.pack.port.ts';
import { setSkillsToolsDeps } from '../../infra/runtime/packs/skills-tools.holder.ts';
import { CreateOrgSkillUseCase } from './create-org-skill.use-case.ts';
import { DeleteOrgSkillUseCase } from './delete-org-skill.use-case.ts';
import { DiscoverRepoSkillsUseCase } from './discover-repo-skills.use-case.ts';
import { InstallRepoSkillsUseCase } from './install-repo-skills.use-case.ts';
import { ListOrgSkillsUseCase } from './list-org-skills.use-case.ts';
import { SearchSkillsUseCase } from './search-skills.use-case.ts';

@Injectable()
export class SkillsToolsProvider {
  constructor(
    private readonly createSkill: CreateOrgSkillUseCase,
    private readonly list: ListOrgSkillsUseCase,
    private readonly remove: DeleteOrgSkillUseCase,
    private readonly discover: DiscoverRepoSkillsUseCase,
    private readonly install: InstallRepoSkillsUseCase,
    private readonly search: SearchSkillsUseCase,
  ) {
    const deps: OrgSkillsDeps = {
      createSkill: this.createSkill,
      list: this.list,
      remove: this.remove,
      discover: this.discover,
      install: this.install,
      search: this.search,
    };
    setSkillsToolsDeps(deps);
  }
}
