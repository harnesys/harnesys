import { Injectable, type ModuleInitHook } from '@harnesys/brix';
import type { OrgSkillsDeps } from '../../infra/runtime/packs/org-skills.pack.port.ts';
import { setSkillsToolsDeps } from '../../infra/runtime/packs/skills-tools.holder.ts';
import { CreateOrgSkillUseCase } from './create-org-skill.use-case.ts';
import { DiscoverRepoSkillsUseCase } from './discover-repo-skills.use-case.ts';
import { InstallRepoSkillsUseCase } from './install-repo-skills.use-case.ts';
import { SearchSkillsUseCase } from './search-skills.use-case.ts';

@Injectable()
export class SkillsToolsProvider implements ModuleInitHook {
  constructor(
    private readonly createSkill: CreateOrgSkillUseCase,
    private readonly discover: DiscoverRepoSkillsUseCase,
    private readonly install: InstallRepoSkillsUseCase,
    private readonly search: SearchSkillsUseCase,
  ) {}

  onModuleInit(): void {
    const deps: OrgSkillsDeps = {
      createSkill: this.createSkill,
      discover: this.discover,
      install: this.install,
      search: this.search,
    };
    setSkillsToolsDeps(deps);
  }
}
