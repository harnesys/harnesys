import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { EulaGate } from '@/app/eula-gate';
import { QueryProvider } from '@/app/query-provider';
import { SessionGate } from '@/app/session-gate';
import { AppUpdateCheck } from '@/features/app-update/app-update-check';
import { OrgProvider } from '@/features/switch-org/org-context';
import { enableSystemNotifications } from '@/shared/lib/system-notification';
import { ThemeProvider } from '@/shared/ui/theme-provider';
import { Toaster } from '@/shared/ui/toast';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    enableSystemNotifications();
  }, []);
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryProvider>
        <EulaGate>
          <SessionGate>
            <OrgProvider>
              <Toaster>
                {children}
                <AppUpdateCheck />
              </Toaster>
            </OrgProvider>
          </SessionGate>
        </EulaGate>
      </QueryProvider>
    </ThemeProvider>
  );
}
