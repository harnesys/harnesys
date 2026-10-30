import type { ProjectFileEntry, ProjectMoveItem, ProjectMoveResult } from '@harnesys/studio-shared';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';
import {
  type ContentEntry,
  downloadContentEntry,
  duplicateContentPath,
  fetchContentBlob,
  listContentTree,
  readContentFile,
  revealContentPath,
  writeContentBytes,
  writeContentFile,
} from './content';

function requireOrgId(): string {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active organization');
  }
  return orgId;
}

function toEntry(entry: ContentEntry, pruned = false): ProjectFileEntry {
  return {
    name: entry.name,
    kind: entry.type,
    path: entry.path,
    size: entry.size,
    modifiedAt: entry.mtime,
    ...(pruned ? { pruned: true } : {}),
  };
}

function contentBase(orgId: string, sourceId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/content`;
}

export function listSourceFiles(projectId: string, subPath = '') {
  const orgId = requireOrgId();
  return listContentTree(orgId, projectId, subPath).then((tree) =>
    tree.entries.map((entry) => toEntry(entry)),
  );
}

export function sourceFilesTreeQueryKey(
  projectId: string,
  includeHidden?: undefined,
): readonly ['sources', string, 'files-tree'];
export function sourceFilesTreeQueryKey(
  projectId: string,
  includeHidden: boolean,
): readonly ['sources', string, 'files-tree', 'hidden' | 'visible'];
export function sourceFilesTreeQueryKey(projectId: string, includeHidden?: boolean) {
  return includeHidden === undefined
    ? (['sources', projectId, 'files-tree'] as const)
    : (['sources', projectId, 'files-tree', includeHidden ? 'hidden' : 'visible'] as const);
}

export async function listSourceFilesTree(
  projectId: string,
  options?: {
    includeHidden?: boolean;
    worktreeId?: string;
  },
): Promise<ProjectFileEntry[]> {
  const orgId = requireOrgId();
  let tree: ContentTreeResponse;
  try {
    tree = await listContentTree(orgId, projectId, '', options?.worktreeId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
  return tree.entries
    .filter((entry) => options?.includeHidden || !entry.name.startsWith('.'))
    .map((entry) => toEntry(entry, entry.type === 'dir'));
}

export async function createProjectFile(
  projectId: string,
  input: {
    path: string;
    kind: 'file' | 'dir';
    worktreeId?: string;
  },
): Promise<{ path: string; kind: 'file' | 'dir' }> {
  const orgId = requireOrgId();
  if (input.kind === 'dir') {
    await apiJson<void>(`${contentBase(orgId, projectId)}/mkdir`, {
      method: 'POST',
      body: JSON.stringify({
        path: input.path,
        ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
      }),
    });
  } else {
    await writeContentFile({
      orgId,
      sourceId: projectId,
      path: input.path,
      content: '',
      ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
    });
  }
  return { path: input.path, kind: input.kind };
}

export async function deleteProjectFile(
  projectId: string,
  path: string,
  worktreeId?: string,
): Promise<void> {
  const orgId = requireOrgId();
  const qs = new URLSearchParams({ path });
  if (worktreeId) {
    qs.set('worktreeId', worktreeId);
  }
  await apiJson<void>(`${contentBase(orgId, projectId)}/remove?${qs}`, {
    method: 'DELETE',
  });
}

export async function moveProjectFiles(
  projectId: string,
  items: ProjectMoveItem[],
  worktreeId?: string,
): Promise<ProjectMoveResult> {
  const orgId = requireOrgId();
  return apiJson<ProjectMoveResult>(`${contentBase(orgId, projectId)}/move`, {
    method: 'POST',
    body: JSON.stringify({ items, ...(worktreeId ? { worktreeId } : {}) }),
  });
}

export interface ProjectCopyResult {
  copied: ProjectMoveItem[];
}

export interface ProjectImportItem {
  fromAbs: string;
  toRel: string;
}

export interface ProjectImportResult {
  imported: ProjectImportItem[];
}

export async function copyProjectFiles(
  projectId: string,
  items: ProjectMoveItem[],
  worktreeId?: string,
): Promise<ProjectCopyResult> {
  const orgId = requireOrgId();
  return apiJson<ProjectCopyResult>(`${contentBase(orgId, projectId)}/copy`, {
    method: 'POST',
    body: JSON.stringify({ items, ...(worktreeId ? { worktreeId } : {}) }),
  });
}

export async function importProjectFiles(
  projectId: string,
  items: ProjectImportItem[],
  worktreeId?: string,
): Promise<ProjectImportResult> {
  const orgId = requireOrgId();
  return apiJson<ProjectImportResult>(`${contentBase(orgId, projectId)}/import`, {
    method: 'POST',
    body: JSON.stringify({ items, ...(worktreeId ? { worktreeId } : {}) }),
  });
}

export async function projectEntryExists(
  projectId: string,
  path: string,
  worktreeId?: string,
): Promise<boolean> {
  const orgId = requireOrgId();
  const qs = new URLSearchParams({ path });
  if (worktreeId) {
    qs.set('worktreeId', worktreeId);
  }
  try {
    await apiJson<unknown>(`${contentBase(orgId, projectId)}/stat?${qs}`);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return false;
    }
    throw err;
  }
}

export async function writeProjectFileBytes(
  projectId: string,
  input: {
    path: string;
    bytes: Uint8Array;
    worktreeId?: string;
  },
): Promise<{ path: string }> {
  const orgId = requireOrgId();
  const result = await writeContentBytes({
    orgId,
    sourceId: projectId,
    path: input.path,
    bytes: input.bytes,
    ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
  });
  return { path: result.path };
}

export function loadProjectFileBlob(
  projectId: string,
  path: string,
  worktreeId?: string,
): Promise<Blob> {
  const orgId = requireOrgId();
  return fetchContentBlob(orgId, projectId, path, worktreeId);
}

export function duplicateProjectEntry(
  projectId: string,
  path: string,
  worktreeId?: string,
): Promise<{ path: string }> {
  const orgId = requireOrgId();
  return duplicateContentPath(orgId, projectId, path, worktreeId);
}

export function revealProjectEntry(
  projectId: string,
  path: string,
  worktreeId?: string,
): Promise<void> {
  const orgId = requireOrgId();
  return revealContentPath(orgId, projectId, path, worktreeId);
}

export async function downloadProjectEntry(
  projectId: string,
  path: string,
  name: string,
  isDir: boolean,
  worktreeId?: string,
): Promise<void> {
  const orgId = requireOrgId();
  const blob = await downloadContentEntry(orgId, projectId, path, worktreeId);
  const fileName = isDir ? `${name}.zip` : name;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFileText(
  projectId: string,
  path: string,
  worktreeId?: string,
): Promise<string> {
  const orgId = requireOrgId();
  const result = await readContentFile(orgId, projectId, path, worktreeId);
  if (result.encoding === 'base64') {
    throw new ApiError(415, 'Binary file preview not supported');
  }
  return result.content;
}

export async function writeProjectFileContent(
  projectId: string,
  input: {
    path: string;
    content: string;
    worktreeId?: string;
  },
): Promise<{ path: string }> {
  const orgId = requireOrgId();
  const result = await writeContentFile({
    orgId,
    sourceId: projectId,
    path: input.path,
    content: input.content,
    ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
  });
  return { path: result.path };
}
