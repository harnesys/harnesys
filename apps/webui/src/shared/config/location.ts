import { useMatch } from 'react-router';
import {
  parseWindowSettingsCategory,
  type StudioFocus,
  studioFocusProjectId,
  studioFocusThreadId,
} from './routes';

function orgLevelFocus(
  orgId: string,
  matches: {
    thread?: { params: { threadId?: string } };
    board?: { params: { boardId?: string } };
    dashboard?: { params: { dashboardId?: string } };
    spawn?: { params: { threadId?: string; spawnId?: string } };
    terminal?: { params: { sessionId?: string } };
    attachment?: { params: { issueId?: string; attachmentId?: string } };
  },
): StudioFocus {
  const threadId = matches.thread?.params.threadId;
  if (threadId) {
    return { kind: 'thread', projectId: orgId, threadId };
  }
  const boardId = matches.board?.params.boardId;
  if (boardId) {
    return { kind: 'board', projectId: orgId, boardId };
  }
  const dashboardId = matches.dashboard?.params.dashboardId;
  if (dashboardId) {
    return { kind: 'dashboard', projectId: orgId, dashboardId };
  }
  const spawn = matches.spawn?.params;
  if (spawn?.threadId && spawn.spawnId) {
    return { kind: 'spawn', projectId: orgId, threadId: spawn.threadId, spawnId: spawn.spawnId };
  }
  const sessionId = matches.terminal?.params.sessionId;
  if (sessionId) {
    return { kind: 'terminal', projectId: orgId, sessionId };
  }
  const attachment = matches.attachment?.params;
  if (attachment?.issueId && attachment.attachmentId) {
    return {
      kind: 'attachment',
      projectId: orgId,
      issueId: attachment.issueId,
      attachmentId: attachment.attachmentId,
    };
  }
  return { kind: 'none' };
}

function projectLevelFocus(matches: {
  thread?: { params: { projectId?: string; threadId?: string } };
  file?: { params: { projectId?: string; '*'?: string | undefined } };
  diff?: { params: { projectId?: string; '*'?: string | undefined } };
  spawn?: { params: { projectId?: string; threadId?: string; spawnId?: string } };
  terminal?: { params: { projectId?: string; sessionId?: string } };
  attachment?: { params: { projectId?: string; issueId?: string; attachmentId?: string } };
}): StudioFocus {
  const thread = matches.thread;
  if (thread?.params.projectId && thread.params.threadId) {
    return {
      kind: 'thread',
      projectId: thread.params.projectId,
      threadId: thread.params.threadId,
    };
  }
  const file = matches.file;
  if (file?.params.projectId && file.params['*']) {
    return { kind: 'file', projectId: file.params.projectId, path: `/${file.params['*']}` };
  }
  const diff = matches.diff;
  if (diff?.params.projectId && diff.params['*']) {
    return { kind: 'diff', projectId: diff.params.projectId, path: `/${diff.params['*']}` };
  }
  const spawn = matches.spawn;
  if (spawn?.params.projectId && spawn.params.threadId && spawn.params.spawnId) {
    return {
      kind: 'spawn',
      projectId: spawn.params.projectId,
      threadId: spawn.params.threadId,
      spawnId: spawn.params.spawnId,
    };
  }
  const terminal = matches.terminal;
  if (terminal?.params.projectId && terminal.params.sessionId) {
    return {
      kind: 'terminal',
      projectId: terminal.params.projectId,
      sessionId: terminal.params.sessionId,
    };
  }
  const attachment = matches.attachment;
  if (attachment?.params.projectId && attachment.params.issueId && attachment.params.attachmentId) {
    return {
      kind: 'attachment',
      projectId: attachment.params.projectId,
      issueId: attachment.params.issueId,
      attachmentId: attachment.params.attachmentId,
    };
  }
  return { kind: 'none' };
}

export function useStudioLocation(): { orgId: string | null; focus: StudioFocus } {
  const org = useMatch('/o/:orgId/*');
  const orgId = org?.params.orgId ?? null;
  const settingsCategoryMatch = useMatch('/o/:orgId/settings/:category');
  const settingsRoot = useMatch('/o/:orgId/settings');
  const orgThread = useMatch('/o/:orgId/thread/:threadId');
  const orgBoard = useMatch('/o/:orgId/board/:boardId');
  const orgDashboard = useMatch('/o/:orgId/dashboard/:dashboardId');
  const orgSpawn = useMatch('/o/:orgId/spawn/:threadId/:spawnId');
  const orgTerminal = useMatch('/o/:orgId/terminal/:sessionId');
  const orgAttachment = useMatch('/o/:orgId/attachment/:issueId/:attachmentId');
  const thread = useMatch('/o/:orgId/:projectId/thread/:threadId');
  const file = useMatch('/o/:orgId/:projectId/file/*');
  const diff = useMatch('/o/:orgId/:projectId/diff/*');
  const spawn = useMatch('/o/:orgId/:projectId/spawn/:threadId/:spawnId');
  const terminal = useMatch('/o/:orgId/:projectId/terminal/:sessionId');
  const attachment = useMatch('/o/:orgId/:projectId/attachment/:issueId/:attachmentId');
  if (settingsCategoryMatch || settingsRoot) {
    return {
      orgId,
      focus: {
        kind: 'settings',
        category: parseWindowSettingsCategory(settingsCategoryMatch?.params.category),
      },
    };
  }
  if (orgId) {
    const focus = orgLevelFocus(orgId, {
      thread: orgThread ?? undefined,
      board: orgBoard ?? undefined,
      dashboard: orgDashboard ?? undefined,
      spawn: orgSpawn ?? undefined,
      terminal: orgTerminal ?? undefined,
      attachment: orgAttachment ?? undefined,
    });
    if (focus.kind !== 'none') {
      return { orgId, focus };
    }
  }
  const focus = projectLevelFocus({
    thread: thread ?? undefined,
    file: file ?? undefined,
    diff: diff ?? undefined,
    spawn: spawn ?? undefined,
    terminal: terminal ?? undefined,
    attachment: attachment ?? undefined,
  });
  if (focus.kind !== 'none') {
    return { orgId, focus };
  }
  return { orgId, focus: { kind: 'none' } };
}
export function useOrgId(): string | null {
  return useStudioLocation().orgId;
}
export { studioFocusProjectId, studioFocusThreadId };
