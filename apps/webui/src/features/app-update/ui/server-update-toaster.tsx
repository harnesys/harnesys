import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { appMetaQuery } from '@/shared/api';
import { toast } from '@/shared/ui/toast';
import { isDesktop } from '../model/app-update';
import { isNewerVersion, latestReleaseQuery } from '../model/server-update';

const TOAST_ID = 'server-update';

/**
 * Server installs (VPS / Docker) cannot self-update from the browser; a
 * persistent toast just points the operator at the new release. Desktop is
 * handled by AppUpdateToaster and skipped here.
 */
export function ServerUpdateToaster() {
  const meta = useQuery(appMetaQuery);
  const latest = useQuery(latestReleaseQuery);
  const current = meta.data?.version;
  const available = latest.data;

  useEffect(() => {
    if (isDesktop() || !current || !available || !isNewerVersion(current, available)) {
      return;
    }
    toast.add({
      id: TOAST_ID,
      title: `Harnesys ${available} is available`,
      description:
        'Server installs update outside the app: `docker compose pull` or `harnesys update`.',
      timeout: 0,
    });
  }, [current, available]);

  return null;
}
