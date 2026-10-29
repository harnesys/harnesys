import { BellIcon, ChevronDownIcon, LogInIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';
import {
  ENTITY_COLOR_NAMES,
  entityColorClass,
  entityColorTintClass,
} from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

function orgDot(orgId: string): string {
  let hash = 0;
  for (let i = 0; i < orgId.length; i += 1) {
    hash = (hash * 31 + orgId.charCodeAt(i)) >>> 0;
  }
  return ENTITY_COLOR_NAMES[hash % ENTITY_COLOR_NAMES.length] ?? 'red';
}

function OrgDot({ orgId }: { orgId: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full', entityColorClass(orgDot(orgId)))}
    />
  );
}

export function OrgHeader({ inboxCount }: { inboxCount?: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgId: urlOrgId } = useParams();
  const { orgs, activeOrgId, setActiveOrgId } = useOrgStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const orgId = urlOrgId ?? activeOrgId;
  const active = orgs.find((entry) => entry.orgId === orgId) ?? null;

  if (!active) {
    return null;
  }

  const waiting = inboxCount ?? 0;
  const onInboxPage = location.pathname.endsWith('/inbox');

  return (
    <div
      className="group flex w-full items-center rounded-md not-last:border-b px-1.5 py-1.5 outline-none transition-colors hover:bg-sidebar-accent/60 data-open:bg-sidebar-accent/60 group-data-[collapsible=icon]:px-0"
      data-open={menuOpen ? '' : undefined}
      data-testid="org-header"
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Organization: ${active.name}`}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none group-data-[collapsible=icon]:justify-center"
            />
          }
        >
          <span
            aria-hidden
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-md font-semibold text-[11px] leading-none ring-1 ring-sidebar-foreground/10 ring-inset',
              entityColorTintClass(orgDot(active.orgId)),
            )}
          >
            {(active.name.trim()[0] ?? '#').toUpperCase()}
          </span>
          <span className="min-w-0 truncate font-semibold text-sidebar-foreground text-sm leading-none tracking-tight group-data-[collapsible=icon]:hidden">
            {active.name}
          </span>
          <ChevronDownIcon
            aria-hidden
            className="size-3 shrink-0 text-sidebar-foreground/50 opacity-50 transition-[opacity,transform] group-hover:opacity-100 group-data-[collapsible=icon]:hidden group-data-open:rotate-180"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="normal-case">Organizations</DropdownMenuLabel>
            {orgs.map((entry) => {
              const isActive = entry.orgId === active.orgId;
              return (
                <DropdownMenuCheckboxItem
                  key={entry.orgId}
                  checked={isActive}
                  onCheckedChange={(checked) => {
                    if (checked && !isActive) {
                      setActiveOrgId(entry.orgId);
                      void activateOrg(entry.orgId).catch(() => undefined);
                      void navigate(studioPath.desk(entry.orgId));
                    }
                  }}
                >
                  <OrgDot orgId={entry.orgId} />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void navigate(studioPath.create, { state: { from: location.pathname } });
            }}
          >
            <PlusIcon className="size-4" />
            New organization…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="org-join-open"
            onClick={() => {
              void navigate(studioPath.join, { state: { from: location.pathname } });
            }}
          >
            <LogInIcon className="size-4" />
            Join organization…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {inboxCount !== undefined ? (
        <Button
          variant="ghost"
          size="icon-xs"
          data-testid="open-inbox-page"
          aria-label={`Inbox: ${waiting} waiting`}
          title="Inbox"
          className={cn(
            'relative bg-transparent shadow-none outline-none hover:bg-transparent group-data-[collapsible=icon]:hidden',
            onInboxPage &&
              'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
          )}
          onClick={(event) => {
            event.stopPropagation();
            const target = urlOrgId ?? activeOrgId;
            if (target) {
              void navigate(studioPath.inbox(target));
            }
          }}
        >
          <BellIcon
            className={cn(
              'size-3.5',
              waiting === 0 ? 'text-sidebar-foreground/40' : 'text-sidebar-foreground/70',
            )}
          />
          {waiting > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-live px-0.5 font-medium text-[8px] text-background leading-none">
              {waiting > 9 ? '9+' : waiting}
            </span>
          ) : null}
        </Button>
      ) : null}
    </div>
  );
}
