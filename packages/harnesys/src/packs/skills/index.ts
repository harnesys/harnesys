import { definePack } from '../../domain/pack.ts';
import { createSkillsTools } from './create-skills-tools.ts';
import type { SkillsPackPorts } from './skills-ports.ts';

export type {
  SkillsCreateSkillInput,
  SkillsInstallSkillInput,
  SkillsPackPorts,
  SkillsSearchResult,
} from './skills-ports.ts';
export const skillsCapability = definePack<SkillsPackPorts, Record<string, unknown>>({
  name: 'skills',
  version: '1.0.0',
  description: 'Org skills management: create_skill / install_skill / search_skills',
  icon: 'skills',
  meta: {
    tools: [
      {
        name: 'create_skill',
        description: 'Create a new org skill from a description and markdown instructions.',
      },
      {
        name: 'install_skill',
        description: 'Install skills into the org from a git repository.',
      },
      {
        name: 'search_skills',
        description: 'Search the skills.sh registry for skills.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({ tools: createSkillsTools(ctx.ports) }),
});
