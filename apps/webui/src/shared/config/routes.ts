import {
  WINDOW_SETTINGS_CATEGORIES,
  type WindowSettingsCategory,
} from '@/shared/config/settings-nav';

export type { WindowSettingsCategory };

export type StudioFocusKind =
  | 'thread'
  | 'file'
  | 'diff'
  | 'schedule'
  | 'webhook'
  | 'spawn'
  | 'terminal'
  | 'board'
  | 'attachment';

export type StudioFocus =
  | { kind: 'none' }
  | { kind: 'settings'; category: WindowSettingsCategory }
  | { kind: 'thread'; projectId: string; threadId: string }
  | { kind: 'file'; projectId: string; path: string }
  | { kind: 'diff'; projectId: string; path: string }
  | { kind: 'schedule'; projectId: string; scheduleId: string }
  | { kind: 'webhook'; projectId: string; webhookId: string }
  | { kind: 'spawn'; projectId: string; threadId: string; spawnId: string }
  | { kind: 'terminal'; projectId: string; sessionId: string }
  | { kind: 'board'; projectId: string; boardId: string }
  | { kind: 'attachment'; projectId: string; issueId: string; attachmentId: string };

export const studioPath = {
  create: '/create',
  join: '/join',
  desk: (orgId: string) => `/o/${orgId}/`,
  org: (orgId: string) => `/o/${orgId}/settings/fleet`,
  fleet: (orgId: string) => `/o/${orgId}/settings/fleet`,
  usage: (orgId: string) => `/o/${orgId}/settings/usage`,
  inbox: (orgId: string) => `/o/${orgId}/inbox`,
  thread: (orgId: string, projectId: string, threadId: string) =>
    projectId === orgId
      ? `/o/${orgId}/thread/${threadId}`
      : `/o/${orgId}/${projectId}/thread/${threadId}`,
  file: (orgId: string, projectId: string, path: string) =>
    `/o/${orgId}/${projectId}/file${path.startsWith('/') ? path : `/${path}`}`,
  diff: (orgId: string, projectId: string, path: string) =>
    `/o/${orgId}/${projectId}/diff${path.startsWith('/') ? path : `/${path}`}`,
  schedule: (orgId: string, projectId: string, scheduleId: string) =>
    projectId === orgId
      ? `/o/${orgId}/schedule/${scheduleId}`
      : `/o/${orgId}/${projectId}/schedule/${scheduleId}`,
  webhook: (orgId: string, projectId: string, webhookId: string) =>
    projectId === orgId
      ? `/o/${orgId}/webhook/${webhookId}`
      : `/o/${orgId}/${projectId}/webhook/${webhookId}`,
  board: (orgId: string, boardId: string) => `/o/${orgId}/board/${boardId}`,
  attachment: (orgId: string, projectId: string, issueId: string, attachmentId: string) =>
    projectId === orgId
      ? `/o/${orgId}/attachment/${issueId}/${attachmentId}`
      : `/o/${orgId}/${projectId}/attachment/${issueId}/${attachmentId}`,
  spawn: (orgId: string, projectId: string, threadId: string, spawnId: string) =>
    projectId === orgId
      ? `/o/${orgId}/spawn/${threadId}/${spawnId}`
      : `/o/${orgId}/${projectId}/spawn/${threadId}/${spawnId}`,
  terminal: (orgId: string, projectId: string, sessionId: string) =>
    projectId === orgId
      ? `/o/${orgId}/terminal/${sessionId}`
      : `/o/${orgId}/${projectId}/terminal/${sessionId}`,
  settings: (orgId: string, category: WindowSettingsCategory = 'appearance') =>
    `/o/${orgId}/settings/${category}`,
  connector: (orgId: string, connectorId: string) =>
    `/o/${orgId}/settings/connectors/${connectorId}`,
};

export function parseWindowSettingsCategory(value: string | undefined): WindowSettingsCategory {
  if (value && (WINDOW_SETTINGS_CATEGORIES as readonly string[]).includes(value)) {
    return value as WindowSettingsCategory;
  }
  return 'appearance';
}

export function studioFocusProjectId(focus: StudioFocus): string | null {
  if (focus.kind === 'none' || focus.kind === 'settings') {
    return null;
  }
  return focus.projectId;
}

export function studioFocusThreadId(focus: StudioFocus): string | null {
  if (focus.kind === 'thread' || focus.kind === 'spawn') {
    return focus.threadId;
  }
  return null;
}
