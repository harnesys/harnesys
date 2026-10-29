import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type {
  DiscoverSkillsBody,
  DiscoverSkillsResponse,
  SkillCandidate,
} from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { clonePlugin, resolveGitSource } from '../../infra/plugins/plugin-git.ts';
import { walkSkills } from '../../infra/skills/skills-walk.ts';

export interface DiscoverRepoSkillsRequest {
  orgId: string;
  body: DiscoverSkillsBody;
}

@Injectable()
export class DiscoverRepoSkillsUseCase {
  constructor(private readonly layout: HostFsLayoutPort) {}

  async execute(request: DiscoverRepoSkillsRequest): Promise<DiscoverSkillsResponse> {
    const staging = join(this.layout.skillsStagingDir(request.orgId), randomUUID());
    try {
      const { revision } = await clonePlugin({
        source: resolveGitSource(request.body.url),
        dest: staging,
        ref: request.body.ref,
      });
      const walk = await walkSkills(staging);
      const candidates: SkillCandidate[] = [];
      const diagnostics: { subPath: string; reason: string }[] = [];
      for (const hit of walk.candidates) {
        const subPath = hit.relativePath === '' ? '.' : hit.relativePath;
        if (hit.invalidReason !== undefined && hit.invalidReason !== 'duplicate-name') {
          diagnostics.push({ subPath, reason: hit.invalidReason });
          continue;
        }
        candidates.push(toContractCandidate(hit, subPath));
      }
      return { revision, candidates, diagnostics };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
}

function toContractCandidate(
  hit: {
    name: string;
    description: string;
    whenToUse?: string;
    outsideContainer: boolean;
    invalidReason?: string;
  },
  subPath: string,
): SkillCandidate {
  return {
    name: hit.name,
    description: hit.description,
    subPath,
    outsideContainer: hit.outsideContainer,
    ...(hit.invalidReason !== undefined ? { invalidReason: hit.invalidReason } : {}),
  };
}
