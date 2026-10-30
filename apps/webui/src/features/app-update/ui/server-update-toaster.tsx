import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOrgStore } from '@/features/switch-org/org-context';
import { appMetaQuery } from '@/shared/api';
import { watchReleaseAvailable } from '@/shared/api/events';
import { toast } from '@/shared/ui/toast';
import { isDesktop } from '../model/app-update';
import { isNewerVersion, previewNotes, releasesQuery } from '../model/server-update';

const TOAST_ID = 'server-update';

/**
 * Server installs (VPS / Docker) cannot self-update from the browser: the
 * host announces a newer release over SSE (daily check, no client polling)
 * and this shows a persistent toast. Desktop is handled by AppUpdateToaster.
 */
export function ServerUpdateToaster() {
  const { activeOrgId } = useOrgStore();
  const queryClient = useQueryClient();
  const meta = useQuery(appMetaQuery(activeOrgId));
  const latest = useQuery(releasesQuery);
  const current = meta.data?.version;
  const available = latest.data?.[0];

  useEffect(() => {
    if (isDesktop()) {
      return;
    }
    return watchReleaseAvailable((frame) => {
      if (frame.orgId !== activeOrgId) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['releases'] });
      const notes = previewNotes(latest.data?.[0]?.notes ?? null);
      toast.add({
        id: TOAST_ID,
        title: `Harnesys ${frame.latestVersion} is available`,
        description:
          notes ??
          'Server installs update outside the app: `docker compose pull` or `harnesys update`.',
        timeout: 0,
      });
    });
  }, [activeOrgId, queryClient, latest.data]);

  useEffect(() => {
    if (
      isDesktop() ||
      typeof current !== 'string' ||
      typeof available?.version !== 'string' ||
      !isNewerVersion(current, available.version)
    ) {
      return;
    }
    const notes = previewNotes(available.notes);
    toast.add({
      id: TOAST_ID,
      title: `Harnesys ${available.version} is available`,
      description:
        notes ??
        'Server installs update outside the app: `docker compose pull` or `harnesys update`.',
      timeout: 0,
    });
  }, [current, available]);

  return null;
}
