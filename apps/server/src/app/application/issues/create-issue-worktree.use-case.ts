import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { CreateIssueWorktreeBody, RepositoryWorktree } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import {
  IssueBoardArchivedException,
  IssueBoardNotFoundException,
  IssueNotFoundException,
  IssueValidationException,
} from '../../domain/issue/issue.error.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { CreateRepositoryWorktreeUseCase } from '../source/create-repository-worktree.use-case.ts';
import { toPublicWorktree } from '../source/to-public-worktree.ts';
import { pickReadyHost, pickReusableWorktree } from './issue-worktree-binding.ts';

export interface CreateIssueWorktreeRequest {
  orgId: string;
  issueId: string;
  body: CreateIssueWorktreeBody;
}

@Injectable()
export class CreateIssueWorktreeUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly createWorktree: CreateRepositoryWorktreeUseCase,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  async execute(request: CreateIssueWorktreeRequest): Promise<RepositoryWorktree> {
    const { orgId, issueId, body } = request;
    const issue = this.loadActiveIssue(orgId, issueId);
    const sourceId = this.gitSourceId(orgId, issue);
    const existing = pickReusableWorktree(this.worktrees.listForIssue(orgId, issueId));
    if (existing) {
      return toPublicWorktree(existing, null);
    }
    const hostId = pickReadyHost({
      orgId,
      sourceId,
      materializations: this.materializations,
      localHostId: this.machineConfig.get().id,
    });
    if (!hostId) {
      throw new IssueValidationException(
        `no ready host for source: ${sourceId} (prepare the source first)`,
      );
    }
    const branch = body.branch?.trim() || issue.branch?.trim();
    if (!branch) {
      throw new IssueValidationException('issue has no branch to create a worktree for');
    }
    const shared = this.worktrees.findActiveByBranch(orgId, sourceId, hostId, branch);
    if (shared && (shared.state === 'ready' || shared.state === 'creating')) {
      return toPublicWorktree(shared, null);
    }
    return this.createForBranch({
      orgId,
      issueId,
      sourceId,
      body,
      hostId,
      branch,
    });
  }

  private async createForBranch(input: {
    orgId: string;
    issueId: string;
    sourceId: string;
    body: CreateIssueWorktreeBody;
    hostId: string;
    branch: string;
  }): Promise<RepositoryWorktree> {
    const { orgId, issueId, sourceId, body, hostId, branch } = input;
    const createBranch = body.createBranch !== false;
    const base = body.baseBranch?.trim() || undefined;
    const created = await this.createWorktree.execute({
      orgId,
      sourceId,
      hostId,
      operationId: randomUUID(),
      branch,
      createBranch,
      ...(createBranch && base ? { from: base } : {}),
      issueId,
    });
    const row = this.worktrees.findById(orgId, created.id);
    if (!row) {
      throw new IssueValidationException(`worktree missing after create: ${created.id}`);
    }
    return toPublicWorktree(row, null);
  }

  private loadActiveIssue(orgId: string, issueId: string): IssueRecord {
    const issue = this.issues.findById(orgId, issueId);
    if (!issue) {
      throw new IssueNotFoundException(issueId);
    }
    const board = this.boards.findById(orgId, issue.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(issue.boardId);
    }
    if (board.status === 'archived') {
      throw new IssueBoardArchivedException(board.id);
    }
    return issue;
  }

  private gitSourceId(orgId: string, issue: IssueRecord): string {
    if (!issue.sourceId) {
      throw new IssueValidationException('issue has no source');
    }
    const source = this.sources.findById(orgId, issue.sourceId);
    if (!source || !hasGitVcs(source)) {
      throw new IssueValidationException(`git source required: ${issue.sourceId}`);
    }
    return source.id;
  }
}
