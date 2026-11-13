import type { AddonCapabilityEffect, AddonCapabilityView } from '@harnesys/contracts';
import {
  CalendarClockIcon,
  ChevronRightIcon,
  CogIcon,
  DatabaseIcon,
  FileTextIcon,
  NetworkIcon,
  PlugIcon,
  RouteIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
  WebhookIcon,
  WrenchIcon,
  ZapIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { RowChip, RowSection } from '@/shared/ui/capability-rows';
import type { SectionProps } from '../lib/section-props';

const EFFECT_TONE: Record<AddonCapabilityEffect, 'neutral' | 'warn' | 'danger'> = {
  read: 'neutral',
  write: 'warn',
  destructive: 'danger',
};

const FAMILY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  config: SlidersHorizontalIcon,
  content: FileTextIcon,
  hook: WebhookIcon,
  job: CalendarClockIcon,
  lsp: TerminalIcon,
  mcp: PlugIcon,
  route: RouteIcon,
  source: DatabaseIcon,
  'source-kind': DatabaseIcon,
  'tool-pack': WrenchIcon,
  transport: NetworkIcon,
  trigger: ZapIcon,
  worker: CogIcon,
};

/** Everything the package declares: tools, routes, jobs, hooks, sources, triggers, workers. */
export function CapabilitiesSection({ detail }: SectionProps) {
  const capabilities = detail.capabilities;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (capabilities.length === 0) {
    return null;
  }

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <RowSection label="Capabilities" count={capabilities.length}>
      {capabilities.map((capability) => {
        const key = `${capability.family}:${capability.id}`;
        return (
          <CapabilityCard
            key={key}
            capability={capability}
            expanded={expanded.has(key)}
            onToggle={() => toggle(key)}
          />
        );
      })}
    </RowSection>
  );
}

function CapabilityCard({
  capability,
  expanded,
  onToggle,
}: {
  capability: AddonCapabilityView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const expandable = capability.items.length > 0;
  const FamilyIcon = FAMILY_ICON[capability.family];
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-lg border bg-popover px-4 py-3"
      data-testid={`addon-capability-${capability.family}-${capability.id}`}
    >
      <button
        type="button"
        className={cn('flex min-w-0 items-center gap-2 text-left', !expandable && 'cursor-default')}
        aria-expanded={expandable ? expanded : undefined}
        disabled={!expandable}
        onClick={expandable ? onToggle : undefined}
      >
        {FamilyIcon ? (
          <FamilyIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium text-sm">{capability.title}</span>
            <RowChip>{capability.family}</RowChip>
            {capability.optional ? <RowChip>optional</RowChip> : null}
          </div>
          {capability.description ? (
            <p className="text-muted-foreground text-xs leading-4">{capability.description}</p>
          ) : null}
        </div>
        {expandable ? (
          <ChevronRightIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
        ) : null}
      </button>
      {expandable && expanded ? (
        <div className="mt-1 flex min-w-0 flex-col gap-1 divide-y divide-border/40 border-t pt-2 pl-6">
          {capability.items.map((item) => (
            <div
              key={item.id}
              className="flex min-w-0 flex-col gap-0.5 py-1.5"
              data-testid={`addon-capability-item-${item.id}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-[13px]">{item.title}</span>
                {item.effect ? (
                  <RowChip tone={EFFECT_TONE[item.effect]}>{item.effect}</RowChip>
                ) : null}
              </div>
              {item.description ? (
                <p className="text-muted-foreground text-xs leading-4">{item.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
