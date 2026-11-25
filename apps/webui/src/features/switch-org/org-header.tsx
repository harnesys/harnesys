import { ChevronDownIcon, LogInIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useOrgStore } from '@/features/switch-org/org-context';
import { activateOrg } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';
import {
  ENTITY_COLOR_NAMES,
  entityColorClass,
  entityColorTintClass,
} from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
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

export function OrgHeader({
  className,
  avatarClassName,
  compact = false,
}: {
  className?: string;
  avatarClassName?: string;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { orgId: urlOrgId } = useParams();
  const { orgs, activeOrgId, setActiveOrgId } = useOrgStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const orgId = urlOrgId ?? activeOrgId;
  const active = orgs.find((entry) => entry.orgId === orgId) ?? null;

  if (!active) {
    return null;
  }

  return (
    <div
      className={cn(
        'group flex min-w-0 items-center rounded-md px-1 py-1.5 outline-none group-data-[collapsible=icon]:px-0',
        compact && 'px-0 py-0',
        className,
      )}
      data-open={menuOpen ? '' : undefined}
      data-testid="org-header"
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Organization: ${active.name}`}
              className={cn(
                'group/org flex min-w-0 cursor-pointer appearance-none items-center gap-2 rounded-md border-0 bg-transparent p-0 text-left text-inherit outline-none group-data-[collapsible=icon]:justify-center',
                compact && 'justify-center',
              )}
            />
          }
        >
          <span
            aria-hidden
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-md font-semibold text-[11px] leading-none ring-1 ring-sidebar-foreground/10 ring-inset',
              entityColorTintClass(orgDot(active.orgId)),
              avatarClassName,
            )}
          >
            {(active.name.trim()[0] ?? '#').toUpperCase()}
          </span>
          <span
            className={cn(
              'min-w-0 truncate font-semibold text-sidebar-foreground text-sm leading-none tracking-tight group-data-[collapsible=icon]:hidden',
              compact && 'hidden',
            )}
          >
            {active.name}
          </span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              'size-3 shrink-0 text-sidebar-foreground/50 opacity-50 transition-[opacity,transform] group-hover/org:opacity-100 group-data-[collapsible=icon]:hidden group-data-open:rotate-180',
              compact && 'hidden',
            )}
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
              void navigate(studioPath.onboardingCreate);
            }}
          >
            <PlusIcon className="size-4" />
            New organization…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="org-join-open"
            onClick={() => {
              void navigate(studioPath.onboardingJoin);
            }}
          >
            <LogInIcon className="size-4" />
            Join organization…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
