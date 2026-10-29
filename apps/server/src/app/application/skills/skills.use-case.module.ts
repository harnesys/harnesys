import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { PluginsModule } from '../../infra/plugins/plugins.module.ts';
import { RuntimeModule } from '../../infra/runtime/runtime.module.ts';
import { SkillsModule } from '../../infra/skills/skills.module.ts';
import { SkillsTierModule } from '../../infra/skills/skills-tier.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { CreateOrgSkillUseCase } from './create-org-skill.use-case.ts';
import { DeleteOrgSkillUseCase } from './delete-org-skill.use-case.ts';
import { DiscoverRepoSkillsUseCase } from './discover-repo-skills.use-case.ts';
import { GetEffectiveSkillsUseCase } from './get-effective-skills.use-case.ts';
import { InstallRepoSkillsUseCase } from './install-repo-skills.use-case.ts';
import { ListOrgSkillsUseCase } from './list-org-skills.use-case.ts';
import { ReloadOrgSkillsUseCase } from './reload-org-skills.use-case.ts';
import { RestoreSystemSkillUseCase } from './restore-system-skill.use-case.ts';
import { SearchSkillsUseCase } from './search-skills.use-case.ts';
import { SkillsToolsProvider } from './skills-tools.provider.ts';
import { UpdateInstalledSkillUseCase } from './update-installed-skill.use-case.ts';

const useCases = [
  ListOrgSkillsUseCase,
  GetEffectiveSkillsUseCase,
  CreateOrgSkillUseCase,
  ReloadOrgSkillsUseCase,
  RestoreSystemSkillUseCase,
  DeleteOrgSkillUseCase,
  SearchSkillsUseCase,
  DiscoverRepoSkillsUseCase,
  InstallRepoSkillsUseCase,
  UpdateInstalledSkillUseCase,
];

@Module({
  imports: [
    SkillsModule,
    SkillsTierModule,
    MachineHomeModule,
    PluginsModule,
    RuntimeModule,
    SourceModule,
    AgentModule,
  ],
  providers: [...useCases, SkillsToolsProvider],
  exports: [...useCases],
})
export class SkillsUseCaseModule {}
