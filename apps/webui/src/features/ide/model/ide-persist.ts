import type {
  PersistedFileRef,
  PersistedIdeTab,
  PersistedIdeWorkspace,
} from '@harnesys/studio-shared';
import { schedulePersistDeskChrome } from '@/features/desk/model/desk-chrome';
import { type FileRef } from '@/features/open-file';
import type { IdeTab } from './ide.store';
import { fileTabFromTarget } from './ide-file-tab';
import {
  collapseLayout,
  createEmptyWorkspace,
  type IdeGroup,
  type IdeSplitNode,
  type IdeWorkspaceState,
} from './ide-layout';
import { normalizeIdeFilePath } from './ide-tab-id';

function targetFromPersisted(tab: PersistedIdeTab): FileRef | null {
  const stored = validStoredTarget(tab.target);
  if (stored) {
    return stored;
  }
  if (tab.kind === 'file') {
    if (!tab.path) {
      return null;
    }
    return {
      source: 'project',
      projectId: tab.projectId,
      path: normalizeIdeFilePath(tab.path),
      ...(tab.worktreeId ? { worktreeId: tab.worktreeId } : {}),
      ...(tab.worktreeBranch ? { worktreeBranch: tab.worktreeBranch } : {}),
    };
  }
  if (tab.kind === 'attachment' && tab.issueId && tab.attachmentId) {
    return {
      source: 'issue-attachment',
      issueId: tab.issueId,
      attachmentId: tab.attachmentId,
      name: tab.path ?? tab.attachmentId,
      mediaType: tab.mediaType ?? '',
    };
  }
  if (tab.kind === 'thread-file' && tab.threadId && tab.path) {
    if (tab.attachmentId) {
      return {
        source: 'thread-attachment',
        threadId: tab.threadId,
        attachmentId: tab.attachmentId,
        name: tab.path,
        mediaType: tab.mediaType ?? '',
      };
    }
    return {
      source: 'thread',
      threadId: tab.threadId,
      path: normalizeIdeFilePath(tab.path),
    };
  }
  return null;
}
function validStoredTarget(target: PersistedFileRef | undefined): FileRef | null {
  if (!target) {
    return null;
  }
  if (target.source === 'project' && typeof target.projectId === 'string' && target.path) {
    return {
      source: 'project',
      projectId: target.projectId,
      path: normalizeIdeFilePath(target.path),
      ...(target.worktreeId ? { worktreeId: target.worktreeId } : {}),
      ...(target.worktreeBranch ? { worktreeBranch: target.worktreeBranch } : {}),
    };
  }
  if (target.source === 'thread' && target.threadId && target.path) {
    return {
      source: 'thread',
      threadId: target.threadId,
      path: normalizeIdeFilePath(target.path),
    };
  }
  if (target.source === 'thread-attachment' && target.threadId && target.attachmentId) {
    return {
      source: 'thread-attachment',
      threadId: target.threadId,
      attachmentId: target.attachmentId,
      name: target.name ?? target.path ?? target.attachmentId,
      mediaType: target.mediaType ?? '',
    };
  }
  if (target.source === 'issue-attachment' && target.issueId && target.attachmentId) {
    return {
      source: 'issue-attachment',
      issueId: target.issueId,
      attachmentId: target.attachmentId,
      name: target.name ?? target.path ?? target.attachmentId,
      mediaType: target.mediaType ?? '',
      ...(target.projectId ? { projectId: target.projectId } : {}),
    };
  }
  return null;
}
function migrateTab(tab: PersistedIdeTab): IdeTab | null {
  const target = targetFromPersisted(tab);
  if (target) {
    return fileTabFromTarget(target, tab.projectId, tab.dirty === true);
  }
  if (tab.kind === 'attachment' || tab.kind === 'thread-file' || tab.kind === 'file') {
    return null;
  }
  return { ...tab, dirty: tab.dirty === true } as IdeTab;
}
export function sanitizeWorkspace(ws: IdeWorkspaceState): IdeWorkspaceState | null {
  const remapped = new Map<string, string>();
  const tabs = dedupeTabs(
    ws.tabs.map((tab) => {
      const migrated = migrateTab(tab);
      if (!migrated) {
        return tab;
      }
      if (migrated.id !== tab.id) {
        remapped.set(tab.id, migrated.id);
      }
      return migrated;
    }),
  );
  const remapId = (id: string): string => remapped.get(id) ?? id;
  const groups = ws.groups.map((group) => ({
    ...group,
    tabIds: [...new Set(group.tabIds.map(remapId))],
    activeId: group.activeId ? remapId(group.activeId) : null,
  }));
  const normalized: IdeWorkspaceState = {
    ...ws,
    tabs,
    groups,
    activeId: ws.activeId ? remapId(ws.activeId) : null,
  };
  const alive = new Set(
    tabs.filter((t) => t.kind !== 'file' || Boolean(t.target)).map((t) => t.id),
  );
  if (alive.size === tabs.length && groups.every((g) => g.tabIds.every((id) => alive.has(id)))) {
    return normalized;
  }
  let layout = normalized.layout;
  const kept: IdeGroup[] = [];
  for (const group of groups) {
    const tabIds = group.tabIds.filter((id) => alive.has(id));
    if (tabIds.length === 0) {
      if (layout) {
        layout = collapseLayout(layout, group.id);
      }
      continue;
    }
    kept.push({
      ...group,
      tabIds,
      activeId:
        group.activeId && alive.has(group.activeId)
          ? group.activeId
          : (tabIds[tabIds.length - 1] ?? null),
    });
  }
  const aliveTabs = tabs.filter((t) => alive.has(t.id));
  if (kept.length === 0) {
    return null;
  }
  const activeId =
    normalized.activeId && alive.has(normalized.activeId) ? normalized.activeId : null;
  const activeGroupId =
    normalized.activeGroupId && kept.some((g) => g.id === normalized.activeGroupId)
      ? normalized.activeGroupId
      : (kept[0]?.id ?? null);
  return { tabs: aliveTabs, activeId, activeGroupId, groups: kept, layout };
}
function dedupeTabs(tabs: IdeTab[]): IdeTab[] {
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    if (seen.has(tab.id)) {
      return false;
    }
    seen.add(tab.id);
    return true;
  });
}
export function workspaceFromPersisted(persisted: PersistedIdeWorkspace | null): IdeWorkspaceState {
  if (!persisted || typeof persisted !== 'object' || !Array.isArray(persisted.tabs)) {
    return createEmptyWorkspace();
  }
  const sanitized = sanitizeWorkspace({
    tabs: persisted.tabs as IdeTab[],
    activeId: persisted.activeId ?? null,
    activeGroupId: persisted.activeGroupId ?? null,
    groups: Array.isArray(persisted.groups) ? persisted.groups : [],
    layout: (persisted.layout ?? null) as IdeSplitNode | null,
  });
  return sanitized ?? createEmptyWorkspace();
}
export function loadPersisted(): IdeWorkspaceState {
  return createEmptyWorkspace();
}
export function persist(_workspace: IdeWorkspaceState) {
  schedulePersistDeskChrome();
}
