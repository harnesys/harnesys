import { useNavigate } from 'react-router';
import { useOrgId } from './location';
import { studioPath, type WindowSettingsCategory } from './routes';
export function useStudioNavigation() {
  const navigate = useNavigate();
  const orgId = useOrgId() ?? '';
  return {
    openDesk() {
      void navigate(studioPath.desk(orgId));
    },
    openOrg() {
      void navigate(studioPath.org(orgId));
    },
    openFleet() {
      void navigate(studioPath.fleet(orgId));
    },
    openUsage() {
      void navigate(studioPath.usage(orgId));
    },
    openInbox() {
      void navigate(studioPath.inbox(orgId));
    },
    openThread(projectId: string, threadId: string) {
      void navigate(studioPath.thread(orgId, projectId, threadId));
    },
    openFile(projectId: string, path: string) {
      void navigate(studioPath.file(orgId, projectId, path));
    },
    openDiff(projectId: string, path: string) {
      void navigate(studioPath.diff(orgId, projectId, path));
    },
    openSchedule(projectId: string, scheduleId: string) {
      void navigate(studioPath.schedule(orgId, projectId, scheduleId));
    },
    openWebhook(projectId: string, webhookId: string) {
      void navigate(studioPath.webhook(orgId, projectId, webhookId));
    },
    openBoard(boardId: string) {
      void navigate(studioPath.board(orgId, boardId));
    },
    openSpawn(projectId: string, threadId: string, spawnId: string) {
      void navigate(studioPath.spawn(orgId, projectId, threadId, spawnId));
    },
    openTerminal(projectId: string, sessionId: string) {
      void navigate(studioPath.terminal(orgId, projectId, sessionId));
    },
    openSettings(category?: WindowSettingsCategory, replace = false) {
      void navigate(studioPath.settings(orgId, category), { replace });
    },
  };
}
