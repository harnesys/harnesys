import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOrgStore } from '@/features/switch-org/org-context';
import { appMetaQuery } from '@/shared/api';
import { toast } from '@/shared/ui/toast';
import { isDesktop } from '../model/app-update';
import { isNewerVersion, releasesQuery } from '../model/server-update';

const TOAST_ID = 'server-update';

/**
 * Server installs (VPS / Docker) cannot self-update from the browser; a
 * persistent toast just points the operator at the new release. Desktop is
 * handled by AppUpdateToaster and skipped here.
 */
export function ServerUpdateToaster() {
  const { activeOrgId } = useOrgStore();
  const meta = useQuery(appMetaQuery(activeOrgId));
  const latest = useQuery(releasesQuery);
  const current = meta.data?.version;
  const available = latest.data?.[0];

  useEffect(() => {
    if (
      isDesktop() ||
      typeof current !== 'string' ||
      typeof available?.version !== 'string' ||
      !isNewerVersion(current, available.version)
    ) {
      return;
    }
    toast.add({
      id: TOAST_ID,
      title: `Harnesys ${available.version} is available`,
      description:
        'Server installs update outside the app: `docker compose pull` or `harnesys update`.',
      timeout: 0,
    });
  }, [current, available]);

  return null;
}
