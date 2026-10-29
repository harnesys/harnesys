import type { UpdateIssueBody } from '@harnesys/contracts';
import type { IssuePriority, IssueRecord } from '@harnesys/studio-shared';
import { useIssueStore } from '@/entities/issue';
import {
  createIssueRecord,
  deleteIssueRecord,
  updateIssueRecord,
  updateIssueStatusRecord,
} from '@/shared/api';
import { selfNodeCached } from '@/shared/api/fleet';
import { createRepositoryWorktree } from '@/shared/api/repository-worktrees';
import { randomUUID } from '@/shared/lib/random-uuid';
import { toast } from '@/shared/ui/toast';
import type { IssueFormDraft } from './issue-draft';
import { errorMessage } from './issue-errors';

export async function createIssueFromDraft(
  orgId: string,
  draft: IssueFormDraft & { boardId: string; parentIssueId?: string },
): Promise<IssueRecord | null> {
  const title = draft.title.trim();
  if (!orgId || !draft.boardId || !title) {
    return null;
  }
  try {
    const issue = await createIssueRecord(orgId, {
      boardId: draft.boardId,
      title,
      description: draft.description.trim(),
      statusKey: draft.statusKey || undefined,
      priority: draft.priority,
      type: draft.type,
      labels: draft.labels,
      assigneeAgentId: draft.assigneeAgentId || null,
      parentIssueId: draft.parentIssueId,
      dueDate: draft.dueDate,
      ...(draft.sourceId ? { sourceId: draft.sourceId } : {}),
      ...(draft.branch ? { branch: draft.branch } : {}),
    });
    useIssueStore.getState().upsert(issue);
    return issue;
  } catch (error) {
    toast.add({ title: 'Create failed', description: errorMessage(error), type: 'error' });
    return null;
  }
}

export async function moveIssueStatus(
  orgId: string,
  issueId: string,
  to: string,
): Promise<boolean> {
  const store = useIssueStore.getState();
  const previous = store.byId(issueId);
  if (!previous || previous.statusKey === to) {
    return true;
  }
  store.upsert({ ...previous, statusKey: to, updatedAt: new Date().toISOString() });
  try {
    const issue = await updateIssueStatusRecord(orgId, issueId, { statusKey: to });
    useIssueStore.getState().upsert(issue);
    return true;
  } catch (error) {
    useIssueStore.getState().upsert(previous);
    toast.add({ title: 'Move failed', description: errorMessage(error), type: 'error' });
    return false;
  }
}

export async function createWorktreeForBranch(input: {
  orgId: string;
  sourceId: string;
  branch: string;
  createBranch: boolean;
}): Promise<boolean> {
  const hostId = selfNodeCached();
  if (!hostId) {
    toast.add({
      title: 'Worktree create failed',
      description: 'No local node available',
      type: 'error',
    });
    return false;
  }
  try {
    await createRepositoryWorktree(input.orgId, input.sourceId, {
      hostId,
      operationId: randomUUID(),
      branch: input.branch,
      createBranch: input.createBranch,
    });
    toast.add({ title: 'Worktree created', type: 'success' });
    return true;
  } catch (error) {
    toast.add({
      title: 'Worktree create failed',
      description: errorMessage(error),
      type: 'error',
    });
    return false;
  }
}

export async function updateIssuePatch(
  orgId: string,
  issueId: string,
  body: UpdateIssueBody,
): Promise<boolean> {
  if (Object.keys(body).length === 0) {
    return true;
  }
  try {
    const issue = await updateIssueRecord(orgId, issueId, body);
    useIssueStore.getState().upsert(issue);
    return true;
  } catch (error) {
    toast.add({ title: 'Save failed', description: errorMessage(error), type: 'error' });
    return false;
  }
}

export async function setIssuePriority(
  orgId: string,
  issueId: string,
  priority: IssuePriority,
): Promise<boolean> {
  try {
    const issue = await updateIssueRecord(orgId, issueId, { priority });
    useIssueStore.getState().upsert(issue);
    return true;
  } catch (error) {
    toast.add({ title: 'Update failed', description: errorMessage(error), type: 'error' });
    return false;
  }
}

export async function deleteIssue(orgId: string, issueId: string): Promise<void> {
  try {
    await deleteIssueRecord(orgId, issueId);
    useIssueStore.getState().remove(issueId);
  } catch (error) {
    toast.add({ title: 'Delete failed', description: errorMessage(error), type: 'error' });
  }
}
