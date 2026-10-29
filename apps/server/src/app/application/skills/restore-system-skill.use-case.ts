import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@harnesys/brix';
import type { OrgSkill } from '@harnesys/contracts';
import { APP_VERSION, bundledAssetsRoot } from '../../../const.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import {
  SkillNotFoundException,
  SkillValidationException,
} from '../../domain/skills/skills.error.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { SkillsTierCache } from '../../infra/skills/skills-tier-cache.ts';
import {
  bundledSkillNames,
  readSeedMarker,
  sha256File,
  writeSeedMarker,
} from '../../infra/skills/system-skills-seed.ts';

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface RestoreSystemSkillRequest {
  name: string;
  orgId?: string;
}

export interface RestoreSystemSkillResponse {
  skill: OrgSkill;
}

function readFrontmatterField(skillMd: string, field: 'name' | 'description'): string {
  for (const m of skillMd.matchAll(/^(?<field>\w+):(?<value>.*)$/gm)) {
    if (m.groups?.field === field && m.groups.value !== undefined) {
      return m.groups.value.trim();
    }
  }
  return '';
}

@Injectable()
export class RestoreSystemSkillUseCase {
  private readonly log: Logger;

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly executor: LocalExecutorPort,
    private readonly skillsEvents: SkillsEventsPort,
    private readonly tierCache: SkillsTierCache,
    logger: Logger,
  ) {
    this.log = logger.child('restore-system-skill');
  }

  async execute(request: RestoreSystemSkillRequest): Promise<RestoreSystemSkillResponse> {
    if (!SKILL_NAME_RE.test(request.name)) {
      throw new SkillValidationException('invalid system skill name');
    }
    const bundledDir = join(bundledAssetsRoot(), 'skills', request.name);
    const bundledSkillMd = join(bundledDir, 'SKILL.md');
    if (
      !bundledSkillNames(bundledAssetsRoot()).includes(request.name) ||
      !existsSync(bundledSkillMd)
    ) {
      throw new SkillNotFoundException(`bundled system skill not found: ${request.name}`);
    }
    const systemDir = this.layout.systemSkillsDir();
    const dest = join(systemDir, request.name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(bundledDir, dest, { recursive: true });
    this.refreshMarker(systemDir, request.name);
    this.log.info({ skill: request.name }, 'system skill restored to bundled');
    if (request.orgId) {
      this.tierCache.invalidate();
      this.skillsEvents.publish(request.orgId, { kind: 'changed', name: request.name });
      this.pluginRuntime.invalidate(request.orgId);
      await this.executor.invalidateRuntime(request.orgId);
    }
    const skillMd = readFileSync(bundledSkillMd, 'utf8');
    return {
      skill: {
        name: request.name,
        description: readFrontmatterField(skillMd, 'description'),
        origin: { kind: 'system' },
        path: dest,
        canDelete: false,
        canUpdate: false,
        loadable: true,
        updateAvailable: false,
      },
    };
  }

  private refreshMarker(systemDir: string, name: string): void {
    const marker = readSeedMarker(systemDir);
    const now = new Date().toISOString();
    const bundledHash = sha256File(join(bundledAssetsRoot(), 'skills', name, 'SKILL.md'));
    const entry = marker?.skills[name];
    writeSeedMarker(systemDir, {
      appVersion: marker?.appVersion ?? APP_VERSION,
      seededAt: marker?.seededAt ?? now,
      skills: {
        ...marker?.skills,
        [name]: { bundledHash, seededAt: entry?.seededAt ?? now, restoredAt: now },
      },
    });
  }
}
