import { SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { OrgHeader } from '@/features/switch-org/org-header';
import type { Source } from '@/shared/api/sources';
import { studioPath } from '@/shared/config/routes';
import { SourcesList } from './sources-list';

export function ShellFrame() {
  const { orgId } = useParams();
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);

  return (
    <div className="flex h-svh min-h-0 w-full bg-background" data-testid="shell-frame">
      <aside
        className="flex w-56 shrink-0 flex-col gap-3 border-sidebar-border border-r bg-sidebar p-2"
        data-testid="shell-sidebar"
      >
        <OrgHeader />
        <nav className="flex flex-col gap-1 px-1">
          {orgId ? (
            <>
              <Link
                to={studioPath.desk(orgId)}
                className="rounded-md px-2.5 py-1.5 text-sidebar-foreground text-sm hover:bg-sidebar-accent"
              >
                Desk
              </Link>
              <Link
                to={studioPath.fleet(orgId)}
                className="rounded-md px-2.5 py-1.5 text-sidebar-foreground text-sm hover:bg-sidebar-accent"
                data-testid="shell-fleet-link"
              >
                Fleet
              </Link>
            </>
          ) : null}
        </nav>
        {orgId ? (
          <SourcesList
            selectedSourceId={selectedSource?.id ?? null}
            onSelect={(source) => setSelectedSource(source)}
          />
        ) : null}
        {orgId ? (
          <Link
            to={studioPath.settings(orgId, 'appearance')}
            className="mt-auto flex items-center gap-2 rounded-md px-2.5 py-1.5 text-muted-foreground text-sm hover:bg-sidebar-accent hover:text-sidebar-foreground"
            data-testid="shell-settings-link"
          >
            <SettingsIcon className="size-3.5" />
            Settings
          </Link>
        ) : null}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet context={{ selectedSource }} />
      </main>
    </div>
  );
}
