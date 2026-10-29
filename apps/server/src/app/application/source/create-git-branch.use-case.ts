import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';
import { toPublicSource } from './to-public-source.ts';

export interface CreateGitBranchInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  name: string;
  checkout?: boolean;
  from?: string;
}

export interface CreateGitBranchResult {
  ok: true;
  source?: Source;
}

@Injectable()
export class CreateGitBranchUseCase {
  constructor(
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly worktrees: GitWorktreeResolver,
    private readonly driver: SourceDriverPort,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: CreateGitBranchInput): Promise<CreateGitBranchResult> {
    const name = input.name.trim();
    if (!name) {
      throw new SourcePathInvalidException('branch name is required');
    }
    if (input.hostId !== this.machineConfig.get().id) {
      throw new SourcePathInvalidException('git branch on a remote host is not supported yet');
    }
    const checkout = input.checkout !== false;
    const from = input.from?.trim() || undefined;
    const resolved = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      if (resolved.kind === 'inplace') {
        await this.git.createBranch(resolved.cwd, name, checkout, from);
        return { ok: true, source: toPublicSource(resolved.record, new Date().toISOString()) };
      }
      const created = await this.driver.createBranch(
        resolved.config.layout,
        resolved.config.worktreeId,
        {
          name,
          checkout,
          from,
        },
      );
      if (!created) {
        return { ok: true };
      }
      const existing = this.materializations.find(input.orgId, input.sourceId, input.hostId);
      const updatedAt = new Date().toISOString();
      this.materializations.upsert({
        orgId: input.orgId,
        sourceId: input.sourceId,
        hostId: input.hostId,
        origin: 'managed',
        localPath: created.contentRoot,
        state: 'ready',
        revision: (existing?.revision ?? 0) + 1,
        updatedAt,
      });
      return {
        ok: true,
        source: toPublicSource(resolved.record, updatedAt),
      };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
