import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { InstallSkillsBody, InstallSkillsResponse, SkillSidecar } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import {
  SkillConflictException,
  SkillValidationException,
} from '../../domain/skills/skills.error.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { clonePlugin, resolveGitSource } from '../../infra/plugins/plugin-git.ts';
import { sanitizeSkillName } from '../../infra/skills/skill-name.ts';
import { type WalkCandidate, walkSkills } from '../../infra/skills/skills-walk.ts';
import { resolveSkillSelection, skillSelectionError } from './skill-selection.ts';

export interface InstallRepoSkillsRequest {
  orgId: string;
  body: InstallSkillsBody;
}

interface PlannedInstall {
  name: string;
  candidate: WalkCandidate;
  subPath: string;
}

@Injectable()
export class InstallRepoSkillsUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly skills: OrgSkillsPort,
    private readonly pluginRuntime: PluginRuntimePort,
    private readonly executor: LocalExecutorPort,
    private readonly skillsEvents: SkillsEventsPort,
  ) {}

  async execute(request: InstallRepoSkillsRequest): Promise<InstallSkillsResponse> {
    const staging = join(this.layout.skillsStagingDir(request.orgId), randomUUID());
    try {
      const { revision } = await clonePlugin({
        source: resolveGitSource(request.body.url),
        dest: staging,
        ref: request.body.ref,
      });
      if (revision !== request.body.revision) {
        throw new SkillConflictException('revision-changed — rerun discover and retry');
      }
      const walk = await walkSkills(staging);
      const planned = request.body.selections.map((selection) =>
        planSelection(walk.candidates, selection),
      );
      return await this.installAll(request, planned, revision);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  private async installAll(
    request: InstallRepoSkillsRequest,
    planned: PlannedInstall[],
    revision: string,
  ): Promise<InstallSkillsResponse> {
    const created: string[] = [];
    const installed: string[] = [];
    const conflicts: string[] = [];
    for (const plan of planned) {
      const sidecar: SkillSidecar = {
        url: request.body.url,
        ...(request.body.ref !== undefined ? { ref: request.body.ref } : {}),
        subPath: plan.subPath,
        revision,
        installedAt: new Date().toISOString(),
      };
      try {
        this.skills.writeSkillDirAtomic(request.orgId, plan.name, plan.candidate.dir, sidecar);
      } catch (error) {
        if (error instanceof SkillConflictException) {
          conflicts.push(plan.name);
          break;
        }
        throw error;
      }
      created.push(plan.name);
      installed.push(plan.name);
    }
    if (conflicts.length > 0) {
      for (const name of created) {
        this.skills.remove(request.orgId, name);
      }
      throw new SkillConflictException('skill name conflicts', { conflicts });
    }
    this.pluginRuntime.invalidate(request.orgId);
    await this.verifyLoaded(request.orgId, installed);
    await this.executor.invalidateRuntime(request.orgId);
    for (const name of installed) {
      this.skillsEvents.publish(request.orgId, { kind: 'changed', name });
    }
    const listed = this.skills.list(request.orgId).filter((s) => installed.includes(s.name));
    return { installed: listed, conflicts: [] };
  }

  private async verifyLoaded(orgId: string, names: string[]): Promise<void> {
    const bundle = await this.pluginRuntime.bundle(orgId);
    const loaded = new Set((await bundle.skills.list()).map((s) => s.name));
    const missing = names.filter((name) => !loaded.has(name));
    if (missing.length > 0) {
      throw new SkillValidationException(`skill was written but not loaded: ${missing.join(', ')}`);
    }
  }
}

function planSelection(candidates: WalkCandidate[], selection: string): PlannedInstall {
  const contract = candidates.map(toContract);
  const direct = contract.find((c) => c.subPath === selection);
  const resolved =
    direct !== undefined
      ? { ok: true as const, subPath: direct.subPath }
      : resolveSkillSelection(contract, selection);
  if (!resolved.ok) {
    throw new SkillValidationException(skillSelectionError(selection, resolved));
  }
  const rel = resolved.subPath === '.' ? '' : resolved.subPath;
  const candidate = candidates.find((c) => c.relativePath === rel);
  if (candidate === undefined) {
    throw new SkillValidationException(`cannot resolve skill selection "${selection}"`);
  }
  const fallback = candidate.relativePath === '' ? basename(candidate.dir) : basename(rel);
  return {
    name: sanitizeSkillName(candidate.name || fallback),
    candidate,
    subPath: resolved.subPath,
  };
}

function toContract(candidate: WalkCandidate): {
  name: string;
  description: string;
  subPath: string;
  outsideContainer: boolean;
  invalidReason?: string;
} {
  return {
    name: candidate.name,
    description: candidate.description,
    subPath: candidate.relativePath === '' ? '.' : candidate.relativePath,
    outsideContainer: candidate.outsideContainer,
    ...(candidate.invalidReason !== undefined ? { invalidReason: candidate.invalidReason } : {}),
  };
}
