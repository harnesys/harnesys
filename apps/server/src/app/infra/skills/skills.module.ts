import { Module } from '@harnesys/brix';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import { SkillSearchPort } from '../../domain/skills/skill-search.port.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { SkillsGitPort } from '../../domain/skills/skills-git.port.ts';
import { SkillsSeedPort } from '../../domain/skills/skills-seed.port.ts';
import { SkillsWalkPort } from '../../domain/skills/skills-walk.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { OrgSettingsAdapter } from './org-settings.adapter.ts';
import { OrgSkillsAdapter } from './org-skills.adapter.ts';
import { SkillsEventsAdapter } from './skills-events.adapter.ts';
import { SkillsGitAdapter } from './skills-git.adapter.ts';
import { SkillsSearchAdapter } from './skills-search.adapter.ts';
import { SkillsSeedAdapter } from './skills-seed.adapter.ts';
import { SkillsTierModule } from './skills-tier.module.ts';
import { SkillsWalkAdapter } from './skills-walk.adapter.ts';
import { SourceSkillsAdapter } from './source-skills.adapter.ts';

@Module({
  global: true,
  imports: [MachineHomeModule, SkillsTierModule],
  providers: [
    { provide: OrgSkillsPort, useClass: OrgSkillsAdapter },
    { provide: SourceSkillsPort, useClass: SourceSkillsAdapter },
    { provide: OrgSettingsPort, useClass: OrgSettingsAdapter },
    { provide: SkillsEventsPort, useClass: SkillsEventsAdapter },
    { provide: SkillSearchPort, useClass: SkillsSearchAdapter },
    { provide: SkillsWalkPort, useClass: SkillsWalkAdapter },
    { provide: SkillsGitPort, useClass: SkillsGitAdapter },
    { provide: SkillsSeedPort, useClass: SkillsSeedAdapter },
  ],
  exports: [
    OrgSkillsPort,
    SourceSkillsPort,
    OrgSettingsPort,
    SkillsEventsPort,
    SkillSearchPort,
    SkillsWalkPort,
    SkillsGitPort,
    SkillsSeedPort,
  ],
})
export class SkillsModule {}
