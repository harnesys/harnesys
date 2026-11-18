import type { LucideIcon } from 'lucide-react';
import { ChevronDownIcon as SelectLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { asRecordArray, asString } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';
import { useStateKeyProp } from '../use-state-key';

export const SelectIcon: LucideIcon = SelectLucideIcon;

interface ResolvedOption {
  label: string;
  value: string;
}

/** Options are `{ label, value }` records; anything without a string value is dropped. */
function optionsOf(raw: unknown): ResolvedOption[] {
  const options: ResolvedOption[] = [];
  const taken = new Set<string>();
  for (const option of asRecordArray(raw)) {
    const value = asString(option.value);
    if (value === undefined || taken.has(value)) {
      continue;
    }
    taken.add(value);
    options.push({ label: asString(option.label) ?? value, value });
  }
  return options;
}

/**
 * Dropdown over `{ label, value }` options. The live selection comes from the
 * state key when one is set, otherwise from the `value` prop; a value that is
 * not among the options falls back to the placeholder. A pick writes the state
 * key (when bound) and leaves as one `change` event.
 */
export function SelectPrimitive({ props, emit }: PrimitiveComponentProps): ReactNode {
  const binding = useStateKeyProp(props);
  const options = optionsOf(props.options);
  if (options.length === 0) {
    return <WidgetEmptyState message="Select has no options" />;
  }

  const label = asString(props.label);
  const selected = asString(binding.value) ?? asString(props.value) ?? '';
  const known = options.some((option) => option.value === selected);

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 p-1">
      {label ? <div className="text-[10px] text-muted-foreground uppercase">{label}</div> : null}
      <Select
        items={options}
        value={known ? selected : null}
        onValueChange={(next: string | null) => {
          const value = asString(next);
          if (value === undefined) {
            return;
          }
          binding.set(value);
          emit('change', { value });
        }}
      >
        <SelectTrigger size="sm" className="w-full" aria-label={label ?? 'Widget select'}>
          <SelectValue placeholder={asString(props.placeholder) ?? 'Select...'} />
        </SelectTrigger>
        <SelectContent className="w-full" align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
