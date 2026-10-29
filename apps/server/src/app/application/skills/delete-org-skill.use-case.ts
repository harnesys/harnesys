import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import {
  SkillNotFoundException,
  SkillReadOnlyException,
} from '../../domain/skills/skills.error.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { SkillsTierCache } from '../../infra/skills/skills-tier-cache.ts';
import { buildMergedSkills } from './skills.helpers.ts';

export interface DeleteOrgSkillRequest {
  orgId: string;
  name: string;
}

@Injectable()
export class DeleteOrgSkillUseCase {
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
    private readonly executor: LocalExecutorPort,
    private readonly skillsEvents: SkillsEventsPort,
  ) {}

  async execute(request: DeleteOrgSkillRequest): Promise<void> {
    const merged = await buildMergedSkills(this, request.orgId);
    const entry = merged.find((skill) => skill.name === request.name);
    if (entry === undefined) {
      throw new SkillNotFoundException(`skill ${request.name} not found`);
    }
    if (entry.origin.kind !== 'org') {
      throw new SkillReadOnlyException(
        `skill is managed outside the organization: ${entry.origin.kind}`,
      );
    }
    this.skills.remove(request.orgId, request.name);
    this.pluginRuntime.invalidate(request.orgId);
    await this.executor.invalidateRuntime(request.orgId);
    this.skillsEvents.publish(request.orgId, { kind: 'changed', name: request.name });
  }
}
