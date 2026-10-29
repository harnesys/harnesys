import { basename, dirname } from 'node:path';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import {
  type IssueWorkspacePlan,
  resolveIssueWorkspacePlan,
} from '../../domain/issue/issue-worktree-binding.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { pickReusableWorktree } from './issue-worktree-binding.ts';

export type IssueDispatchPlan = IssueWorkspacePlan | 'unbound';

export interface IssueWorkspaceResolution {
  plan: IssueDispatchPlan;
  sourceId: string | null;
  branch: string | null;
  worktree: RepositoryWorktree | null;
}

export interface ResolveIssueWorkspaceInput {
  orgId: string;
  localHostId: string;
  issue: IssueRecord;
  sources: SourceRegistryPort;
  worktrees: RepositoryWorktreePort;
  materializations: SourceMaterializationPort;
  layout: HostFsLayoutPort;
  driver: SourceDriverPort;
}

export interface OpenIssueRef {
  id: string;
  title: string;
  sourceId: string | null;
  branch: string | null;
  closedAt: string | null;
}

export function resolveDispatchSource(
  sources: SourceRegistryPort,
  orgId: string,
  issue: IssueRecord,
) {
  return issue.sourceId !== null
    ? sources.findById(orgId, issue.sourceId)
    : sources.findManagedWorkspace(orgId);
}

export function issueBranchOf(issue: IssueRecord): string | null {
  return issue.branch?.trim() || null;
}

export async function resolveIssueWorkspace(
  input: ResolveIssueWorkspaceInput,
): Promise<IssueWorkspaceResolution> {
  const sourceId = resolveDispatchSource(input.sources, input.orgId, input.issue)?.id ?? null;
  const branch = issueBranchOf(input.issue);
  if (branch === null) {
    return { plan: 'unbound', sourceId, branch: null, worktree: null };
  }
  if (sourceId === null) {
    return { plan: 'blocked', sourceId: null, branch, worktree: null };
  }
  const active = input.worktrees.findActiveByBranch(
    input.orgId,
    sourceId,
    input.localHostId,
    branch,
  );
  const worktree = active === null ? null : pickReusableWorktree([active]);
  if (worktree !== null) {
    return { plan: 'worktree', sourceId, branch, worktree };
  }
  const activeBranch = await resolveCheckoutBranch({
    orgId: input.orgId,
    sourceId,
    localHostId: input.localHostId,
    materializations: input.materializations,
    layout: input.layout,
    driver: input.driver,
  });
  return {
    plan: resolveIssueWorkspacePlan({ branch, activeBranch, hasWorktree: false }),
    sourceId,
    branch,
    worktree: null,
  };
}

export async function resolveCheckoutBranch(input: {
  orgId: string;
  sourceId: string;
  localHostId: string;
  materializations: SourceMaterializationPort;
  layout: HostFsLayoutPort;
  driver: SourceDriverPort;
}): Promise<string | null> {
  const materialization = input.materializations.find(
    input.orgId,
    input.sourceId,
    input.localHostId,
  );
  const localPath = materialization?.state === 'ready' ? materialization.localPath : null;
  if (!localPath) {
    return null;
  }
  const observation = await input.driver
    .observeWorktree(
      {
        bareRepoPath: input.layout.orgSourceDir(input.orgId, input.sourceId),
        worktreesRoot: dirname(localPath),
      },
      basename(localPath),
    )
    .catch(() => null);
  return observation?.branch ?? null;
}

export function pickCheckoutSibling(
  rows: OpenIssueRef[],
  issue: IssueRecord,
  sourceId: string | null,
  branch: string | null,
): OpenIssueRef | null {
  if (sourceId === null || branch === null) {
    return null;
  }
  const target = branch.trim().toLowerCase();
  return (
    rows.find(
      (row) =>
        row.id !== issue.id &&
        row.closedAt === null &&
        row.sourceId === sourceId &&
        (row.branch?.trim().toLowerCase() ?? '') === target,
    ) ?? null
  );
}

export function blockedWorktreeNotificationText(branch: string): string {
  return `issue needs a worktree for branch ${branch} — create it on the issue (Create now / auto on status)`;
}

export function checkoutSiblingNotificationText(sibling: OpenIssueRef, branch: string): string {
  return `open issue "${sibling.title}" (${sibling.id}) also uses branch ${branch} — the checkout is shared, run them sequentially or give this issue its own worktree`;
}

export function worktreeAutoCreateFailedText(branch: string, reason: string): string {
  return `worktree auto-create for branch ${branch} failed: ${reason} — create it manually on the issue`;
}

export function shouldAutoCreateWorktree(input: {
  issue: IssueRecord;
  enteredStatusKey: string;
  hasActiveWorktree: boolean;
}): boolean {
  const hook = input.issue.worktreeOnStatus?.trim();
  return (
    hook !== undefined &&
    hook !== '' &&
    hook === input.enteredStatusKey &&
    input.issue.sourceId !== null &&
    issueBranchOf(input.issue) !== null &&
    !input.hasActiveWorktree
  );
}
