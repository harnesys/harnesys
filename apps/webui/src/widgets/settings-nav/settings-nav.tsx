import type { SettingsNavGroup } from '@/shared/config/settings-nav';
import { cn } from '@/shared/lib/utils';

export function SettingsNav({
  groups,
  active,
  onSelect,
  testIdPrefix = 'settings-nav',
  className,
}: {
  groups: SettingsNavGroup[];
  active: string;
  onSelect: (id: string) => void;
  testIdPrefix?: string;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        'flex flex-row gap-4 overflow-x-auto px-2 py-2 md:flex-col md:gap-5 md:overflow-visible',
        className,
      )}
      data-testid={`${testIdPrefix}`}
    >
      {groups.map((group) => (
        <div key={group.id} className="flex min-w-36 flex-col gap-0.5 md:min-w-0">
          {group.label ? (
            <p className="px-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const selected = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`${testIdPrefix}-${item.id}`}
                data-active={selected ? 'true' : 'false'}
                className={cn(
                  'flex h-7 items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors',
                  selected
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
                )}
                onClick={() => onSelect(item.id)}
              >
                <item.icon className="size-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
