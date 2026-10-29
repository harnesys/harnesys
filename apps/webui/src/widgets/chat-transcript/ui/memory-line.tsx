import { BrainCircuitIcon } from 'lucide-react';
import type { MemoryEvent } from '@/entities/session';
import { ActivityLine } from './activity-line';
export function MemoryLine({ event }: { event: MemoryEvent }) {
  const facts = event.facts ?? [];
  return (
    <ActivityLine icon={BrainCircuitIcon} label={memoryLabel(event)} hasContent={facts.length > 0}>
      <div className="flex flex-col gap-1">
        {facts.map((fact) => (
          <div key={fact.factId} className="flex min-w-0 flex-col text-[13px] leading-5">
            <span className="text-[10px] text-muted-foreground/70">
              {fact.action === 'added' ? 'New' : 'Refreshed'}
            </span>
            <span className="whitespace-pre-wrap text-muted-foreground/90">{fact.text}</span>
          </div>
        ))}
      </div>
    </ActivityLine>
  );
}
function memoryLabel(event: MemoryEvent): string {
  if (event.subtype === 'memory.reflected') {
    return 'Memory reflection: session experience synthesized into long-term memory';
  }
  if (event.subtype === 'memory.superseded') {
    return 'Memory fact superseded';
  }
  const parts: string[] = [];
  if (event.added) {
    parts.push(`+${event.added} new`);
  }
  if (event.updated) {
    parts.push(`${event.updated} refreshed`);
  }
  if (parts.length === 0) {
    return 'Memory consolidation ran with no changes';
  }
  const suffix = event.superseded ? ` · ${event.superseded} superseded` : '';
  return `Memory updated: ${parts.join(', ')}${suffix}`;
}
