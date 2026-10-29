import { Injectable } from '@harnesys/brix';
import type { ListEffectiveSkillsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { SkillsTierCache } from '../../infra/skills/skills-tier-cache.ts';
import { requireAgent } from '../agents/agent.helpers.ts';
import { buildMergedSkills } from './skills.helpers.ts';

export interface GetEffectiveSkillsRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class GetEffectiveSkillsUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    readonly layout: HostFsLayoutPort,
    readonly tierCache: SkillsTierCache,
    readonly skills: OrgSkillsPort,
    readonly pluginRuntime: PluginRuntimePort,
    readonly sources: SourceRegistryPort,
    readonly sourceLocation: SourceLocationPort,
    readonly sourceSkills: SourceSkillsPort,
    readonly machine: MachineConfigPort,
    readonly orgSettings: OrgSettingsPort,
  ) {}

  async execute(request: GetEffectiveSkillsRequest): Promise<ListEffectiveSkillsResponse> {
    const agent = requireAgent(this.agents, request.orgId, request.agentId);
    const aclSourceIds = new Set(agent.sharedSourceIds);
    const catalog = await buildMergedSkills(this, request.orgId, {
      sourceFilter: (source) => aclSourceIds.has(source.id),
    });
    const granted = new Set(agent.skills);
    return {
      skills: catalog.map((skill) => ({ ...skill, granted: granted.has(skill.name) })),
    };
  }
}
