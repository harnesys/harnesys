import { CogIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { automationInk, automationStatusLabel, type ClientAutomation } from '@/entities/automation';
import { automationKindLabel } from '@/integrations/registry';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
export function AutomationRow({
  automation,
  icon: Icon,
  selected,
  onSelect,
  onSettings,
}: {
  automation: ClientAutomation;
  icon: ComponentType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
  onSettings: () => void;
}) {
  return (
    <div
      className={cn(
        'group/auto relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
      )}
      data-testid={`automation-${automation.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left"
        onClick={onSelect}
      >
        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-4">{automation.label}</span>
          <span className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] text-muted-foreground leading-4">
              {automationKindLabel(automation.integrationId, automation.kind) ?? automation.kind}
            </span>
            <span className={cn('shrink-0 font-mono text-[8px]', automationInk(automation.status))}>
              {automationStatusLabel(automation.status)}
            </span>
          </span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1 right-1 opacity-0 group-hover/auto:opacity-100"
        title="Configure automation"
        data-testid={`automation-config-${automation.id}`}
        onClick={(event) => {
          event.stopPropagation();
          onSettings();
        }}
      >
        <CogIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">Configure automation</span>
      </Button>
    </div>
  );
}
