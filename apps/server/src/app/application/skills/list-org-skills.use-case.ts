import { Injectable } from '@harnesys/brix';
import type { ListOrgSkillsResponse } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { SkillsTierCache } from '../../infra/skills/skills-tier-cache.ts';
import { buildMergedSkills } from './skills.helpers.ts';

export interface ListOrgSkillsRequest {
  orgId: string;
}

@Injectable()
export class ListOrgSkillsUseCase {
  constructor(
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

  async execute(request: ListOrgSkillsRequest): Promise<ListOrgSkillsResponse> {
    return {
      skills: await buildMergedSkills(this, request.orgId),
    };
  }
}
