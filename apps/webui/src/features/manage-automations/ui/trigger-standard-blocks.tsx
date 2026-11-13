import type { Agent } from '@/entities/agent';
import type { TriggerStandardOverrides } from '@/features/manage-addons/lib/view-sections';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

export function NameAgentBlock({
  standard,
  label,
  agents,
  agentId,
  onLabel,
  onAgent,
}: {
  standard: TriggerStandardOverrides;
  label: string;
  agents: Agent[];
  agentId: string;
  onLabel: (value: string) => void;
  onAgent: (value: string) => void;
}) {
  return (
    <Field data-invalid={label.trim().length === 0 || undefined}>
      <FieldLabel htmlFor="addon-trigger-label">{standard.name?.label ?? 'Name'}</FieldLabel>
      <div className="grid items-start gap-1.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            {standard.name?.label ?? 'Name'}
          </span>
          <Input
            id="addon-trigger-label"
            value={label}
            placeholder="New Gmail message"
            aria-invalid={label.trim().length === 0 || undefined}
            onChange={(event) => onLabel(event.target.value)}
          />
        </div>
        {standard.agent?.disabled ? null : (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {standard.agent?.label ?? 'Agent'}
            </span>
            <Select
              items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
              value={agentId || null}
              onValueChange={(value) => {
                if (typeof value === 'string') {
                  onAgent(value);
                }
              }}
            >
              <SelectTrigger id="addon-trigger-agent" className="w-full">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {standard.name?.help ? <FieldDescription>{standard.name.help}</FieldDescription> : null}
    </Field>
  );
}

export function ModeBlock({
  standard,
  modeItems,
  modeId,
  onChange,
}: {
  standard: TriggerStandardOverrides;
  modeItems: Array<{ value: string; label: string }>;
  modeId: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="addon-trigger-mode">{standard.mode?.label ?? 'Mode'}</FieldLabel>
      <Select
        items={modeItems}
        value={modeId}
        onValueChange={(value) => {
          if (typeof value === 'string') {
            onChange(value);
          }
        }}
      >
        <SelectTrigger id="addon-trigger-mode" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {modeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {standard.mode?.help ? <FieldDescription>{standard.mode.help}</FieldDescription> : null}
    </Field>
  );
}

export function ConnectionMissingBanner({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-destructive text-sm">
        Connect a {label} account on the add-on page first.
      </p>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={onOpen}>
        Open add-on
      </Button>
    </div>
  );
}
