import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useIssueLabelStore } from '@/entities/issue';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { LabelPicker } from './label-picker';

export function LabelsManager({ orgId }: { orgId: string }) {
  const labels = useIssueLabelStore((state) => state.items);
  const [editing, setEditing] = useState<IssueLabelRecord | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((label) => (
        <Popover
          key={label.id}
          open={editing?.id === label.id}
          onOpenChange={(open) => setEditing(open ? label : null)}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                className="inline-flex h-6 select-none items-center gap-1 rounded-md border px-2 font-medium text-[10px] transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: `${label.color}1f`,
                  borderColor: `${label.color}33`,
                  color: label.color,
                }}
                data-testid={`label-badge-${label.id}`}
              />
            }
          >
            <span
              className="size-1 shrink-0 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            {label.title}
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={4} className="w-64 p-1.5">
            <LabelPicker
              key={editing?.id ?? 'edit'}
              orgId={orgId}
              selected={[]}
              onChange={() => undefined}
              manage
              initialEditing={label}
              onSaved={() => setEditing(null)}
            />
          </PopoverContent>
        </Popover>
      ))}
      <Popover open={creating} onOpenChange={setCreating}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="inline-flex h-6 select-none items-center gap-1 rounded-md border border-dashed px-2 font-medium text-[10px] text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
              data-testid="labels-manager-create"
            />
          }
        >
          <PlusIcon className="size-3" />
          New label
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className="w-64 p-1.5">
          <LabelPicker
            key={creating ? 'creating' : 'idle'}
            orgId={orgId}
            selected={[]}
            onChange={() => undefined}
            manage
            initialCreating
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
