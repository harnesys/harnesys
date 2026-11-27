import { definePack } from '../../domain/pack.ts';
import { createSkillsTools } from './create-skills-tools.ts';
import type { SkillsPackPorts } from './skills-ports.ts';

export type {
  SkillsCreateSkillInput,
  SkillsDeleteSkillInput,
  SkillsInstallSkillInput,
  SkillsListEntry,
  SkillsPackPorts,
  SkillsSearchResult,
} from './skills-ports.ts';
export const skillsCapability = definePack<SkillsPackPorts, Record<string, unknown>>({
  name: 'skills',
  version: '1.0.0',
  description:
    'Org skills management: create_skill / list_skills / delete_skill / install_skill / search_skills',
  icon: 'skills',
  meta: {
    tools: [
      {
        name: 'create_skill',
        description: 'Create a new org skill from a description and markdown instructions.',
      },
      {
        name: 'list_skills',
        description: 'List org-visible skills across tiers with origin and install source.',
      },
      {
        name: 'delete_skill',
        description: 'Delete an org-owned skill; other tiers are refused with the tier named.',
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
