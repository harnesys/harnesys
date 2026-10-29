import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { QueryProvider } from '@/app/query-provider';
import { SessionGate } from '@/app/session-gate';
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
        <SessionGate>
          <OrgProvider>
            <Toaster>{children}</Toaster>
          </OrgProvider>
        </SessionGate>
      </QueryProvider>
    </ThemeProvider>
  );
}
