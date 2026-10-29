import type { IssueDependencyType } from '@harnesys/studio-shared';
import { useIssueLabelStore } from '@/entities/issue';
import {
  addIssueComment,
  addIssueDependency,
  addIssueSourceAttachment,
  createIssueLabel,
  deleteIssueAttachment,
  deleteIssueLabel,
  removeIssueDependency,
  updateIssueLabel,
  uploadIssueAttachment,
} from '@/shared/api';
import { toast } from '@/shared/ui/toast';
import { errorMessage } from './issue-errors';
import { refreshIssueAttachmentCounts } from './refresh-issue-attachments';

function notifyError(title: string, error: unknown): void {
  toast.add({ title, description: errorMessage(error), type: 'error' });
}

export async function addIssueCommentAction(
  orgId: string,
  issueId: string,
  body: string,
): Promise<boolean> {
  try {
    await addIssueComment(orgId, issueId, { body });
    return true;
  } catch (error) {
    notifyError('Comment failed', error);
    return false;
  }
}

export async function addIssueDependencyAction(
  orgId: string,
  issueId: string,
  dependsOnIssueId: string,
  type: IssueDependencyType,
): Promise<boolean> {
  try {
    await addIssueDependency(orgId, issueId, { dependsOnIssueId, type });
    return true;
  } catch (error) {
    notifyError('Dependency failed', error);
    return false;
  }
}

export async function removeIssueDependencyAction(
  orgId: string,
  issueId: string,
  dependsOnIssueId: string,
): Promise<boolean> {
  try {
    await removeIssueDependency(orgId, issueId, dependsOnIssueId);
    return true;
  } catch (error) {
    notifyError('Remove failed', error);
    return false;
  }
}

export async function uploadIssueAttachmentAction(
  orgId: string,
  issueId: string,
  file: File,
): Promise<boolean> {
  try {
    await uploadIssueAttachment(orgId, issueId, file);
    void refreshIssueAttachmentCounts(orgId);
    return true;
  } catch (error) {
    notifyError('Upload failed', error);
    return false;
  }
}

export async function addIssueSourceAttachmentAction(
  orgId: string,
  issueId: string,
  sourceId: string,
  sourcePath: string,
): Promise<boolean> {
  try {
    await addIssueSourceAttachment(orgId, issueId, { sourceId, sourcePath });
    void refreshIssueAttachmentCounts(orgId);
    return true;
  } catch (error) {
    notifyError('Attach failed', error);
    return false;
  }
}

export async function deleteIssueAttachmentAction(
  orgId: string,
  issueId: string,
  attachmentId: string,
): Promise<boolean> {
  try {
    await deleteIssueAttachment(orgId, issueId, attachmentId);
    void refreshIssueAttachmentCounts(orgId);
    return true;
  } catch (error) {
    notifyError('Delete failed', error);
    return false;
  }
}

export async function createIssueLabelAction(
  orgId: string,
  title: string,
  color: string,
): Promise<string | null> {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const labels = await createIssueLabel(orgId, { title: trimmed, color });
    useIssueLabelStore.getState().replaceAll(labels);
    return labels.find((label) => label.title.toLowerCase() === trimmed.toLowerCase())?.id ?? null;
  } catch (error) {
    notifyError('Label failed', error);
    return null;
  }
}

export async function renameIssueLabelAction(
  orgId: string,
  labelId: string,
  patch: { title?: string; color?: string },
): Promise<boolean> {
  try {
    const labels = await updateIssueLabel(orgId, labelId, patch);
    useIssueLabelStore.getState().replaceAll(labels);
    return true;
  } catch (error) {
    notifyError('Label update failed', error);
    return false;
  }
}

export async function deleteIssueLabelAction(orgId: string, labelId: string): Promise<boolean> {
  try {
    await deleteIssueLabel(orgId, labelId);
    useIssueLabelStore.getState().remove(labelId);
    return true;
  } catch (error) {
    notifyError('Label delete failed', error);
    return false;
  }
}
