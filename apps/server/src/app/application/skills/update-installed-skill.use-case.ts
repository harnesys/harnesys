import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { OrgSkill, SkillSidecar } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import { SkillValidationException } from '../../domain/skills/skills.error.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { clonePlugin, resolveGitSource } from '../../infra/plugins/plugin-git.ts';
import { walkSkills } from '../../infra/skills/skills-walk.ts';

const SIDECAR_FILE = '.harnesys-skill.json';

export interface UpdateInstalledSkillRequest {
  orgId: string;
  name: string;
}

export interface UpdateInstalledSkillResponse {
  skill: OrgSkill;
}

@Injectable()
export class UpdateInstalledSkillUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly skills: OrgSkillsPort,
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly executor: LocalExecutorPort,
    private readonly skillsEvents: SkillsEventsPort,
  ) {}

  async execute(request: UpdateInstalledSkillRequest): Promise<UpdateInstalledSkillResponse> {
    const sidecar = this.skills.readSidecar(request.orgId, request.name);
    if (sidecar === undefined) {
      throw new SkillValidationException('skill was not installed from a repository');
    }
    const staging = join(this.layout.skillsStagingDir(request.orgId), randomUUID());
    try {
      const { revision } = await clonePlugin({
        source: resolveGitSource(sidecar.url),
        dest: staging,
        ref: sidecar.ref,
      });
      const candidateDir = await this.locate(staging, sidecar);
      const dest = join(this.layout.skillsDir(request.orgId), request.name);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dest, { recursive: true });
      cpSync(candidateDir, dest, { recursive: true });
      const next: SkillSidecar = { ...sidecar, revision, installedAt: new Date().toISOString() };
      writeFileSync(join(dest, SIDECAR_FILE), JSON.stringify(next, null, 2), 'utf8');
      this.pluginRuntime.invalidate(request.orgId);
      await this.executor.invalidateRuntime(request.orgId);
      this.skillsEvents.publish(request.orgId, { kind: 'changed', name: request.name });
      const skill = this.skills.list(request.orgId).find((s) => s.name === request.name);
      if (skill === undefined) {
        throw new SkillValidationException(`skill ${request.name} disappeared after update`);
      }
      return { skill };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  private async locate(staging: string, sidecar: SkillSidecar): Promise<string> {
    const walk = await walkSkills(staging);
    const rel = sidecar.subPath === '.' ? '' : sidecar.subPath;
    const candidate = walk.candidates.find(
      (c) => c.relativePath === rel && c.invalidReason === undefined,
    );
    if (candidate === undefined) {
      throw new SkillValidationException(
        `skill not found in repository at ${sidecar.subPath} — rerun install instead`,
      );
    }
    return candidate.dir;
  }
}
