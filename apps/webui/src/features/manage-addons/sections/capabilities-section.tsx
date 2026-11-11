import type { AddonCapabilityEffect } from '@harnesys/contracts';
import { useState } from 'react';
import { Row, RowChip, RowItem, RowSection } from '@/shared/ui/capability-rows';
import type { SectionProps } from '../lib/section-props';

const EFFECT_TONE: Record<AddonCapabilityEffect, 'neutral' | 'warn' | 'danger'> = {
  read: 'neutral',
  write: 'warn',
  destructive: 'danger',
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
        const expandable = capability.items.length > 0;
        return (
          <Row
            key={key}
            testId={`addon-capability-${capability.family}-${capability.id}`}
            mono={false}
            title={capability.title}
            meta={capability.family}
            chips={capability.optional ? <RowChip>optional</RowChip> : null}
            summary={capability.description || undefined}
            onToggle={expandable ? () => toggle(key) : undefined}
            expanded={expanded.has(key)}
          >
            {capability.items.map((item) => (
              <RowItem
                key={item.id}
                title={item.title}
                description={item.description || undefined}
                testId={`addon-capability-item-${item.id}`}
                chips={
                  item.effect ? (
                    <RowChip tone={EFFECT_TONE[item.effect]}>{item.effect}</RowChip>
                  ) : null
                }
              />
            ))}
          </Row>
        );
      })}
    </RowSection>
  );
}
