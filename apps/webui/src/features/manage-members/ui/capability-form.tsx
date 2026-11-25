import { useId } from 'react';
import type { MemberCapability } from '@/shared/api/members';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import {
  CAPABILITY_GROUPS,
  CAPABILITY_LABELS,
  type MemberRole,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_ORDER,
} from '../model/member-access';

export function RolePicker({
  value,
  onChange,
  testIdPrefix,
}: {
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  testIdPrefix: string;
}) {
  return (
    <RadioGroup
      value={value}
      className="grid gap-2 sm:grid-cols-2"
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onChange(next as MemberRole);
        }
      }}
    >
      {ROLE_ORDER.map((role) => {
        const id = `${testIdPrefix}-role-${role}`;
        const active = value === role;
        return (
          <Label
            key={role}
            htmlFor={id}
            data-testid={`${testIdPrefix}-preset-${role}`}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 font-normal transition-colors',
              active ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40',
            )}
          >
            <RadioGroupItem id={id} value={role} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-sm leading-5">{ROLE_LABELS[role]}</span>
              <span className="text-muted-foreground text-xs leading-4">
                {ROLE_DESCRIPTIONS[role]}
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

export function CapabilityChecklist({
  capabilities,
  onToggle,
  testIdPrefix,
}: {
  capabilities: readonly MemberCapability[];
  onToggle: (capability: MemberCapability, checked: boolean) => void;
  testIdPrefix: string;
}) {
  const inputPrefix = useId();
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid={`${testIdPrefix}-capability-grid`}>
      {CAPABILITY_GROUPS.map((group) => {
        const selected = group.capabilities.filter((capability) =>
          capabilities.includes(capability),
        ).length;
        return (
          <div key={group.label} className="rounded-lg border bg-muted/20 p-2.5">
            <p className="mb-2 flex items-baseline justify-between gap-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
              {group.label}
              <span className="font-mono font-normal text-[10px] tabular-nums">
                {selected}/{group.capabilities.length}
              </span>
            </p>
            <div className="flex flex-col gap-1.5">
              {group.capabilities.map((capability) => {
                const id = `${inputPrefix}-${capability.replace(/[^a-z0-9]+/gi, '-')}`;
                return (
                  <div
                    key={capability}
                    className="flex items-start gap-2"
                    data-testid={`${testIdPrefix}-capability-${capability}`}
                  >
                    <Checkbox
                      id={id}
                      checked={capabilities.includes(capability)}
                      className="mt-px"
                      onCheckedChange={(checked) => onToggle(capability, checked === true)}
                    />
                    <label
                      htmlFor={id}
                      title={capability}
                      className="min-w-0 cursor-pointer text-xs leading-4"
                    >
                      {CAPABILITY_LABELS[capability]}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
