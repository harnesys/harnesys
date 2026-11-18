import type { LucideIcon } from 'lucide-react';
import { ToggleRightIcon as SwitchLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Switch } from '@/shared/ui/switch';
import { asBool, asString } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { useStateKeyProp } from '../use-state-key';

export const SwitchIcon: LucideIcon = SwitchLucideIcon;

/**
 * Boolean toggle. The live value comes from the state key when one is set,
 * otherwise from the `checked` prop (which is also the fallback before the key
 * holds a value); a non-boolean value reads as off. One activation writes the
 * state key (when bound) and leaves one `change` event with the new value.
 */
export function SwitchPrimitive({ props, emit }: PrimitiveComponentProps): ReactNode {
  const binding = useStateKeyProp(props);
  const label = asString(props.label);
  const checked = asBool(
    binding.bound && binding.value !== undefined ? binding.value : props.checked,
  );

  const onCheckedChange = (next: boolean): void => {
    binding.set(next);
    emit('change', { checked: next });
  };

  return (
    <div className="flex h-full w-full items-center justify-between gap-2 p-1">
      {label ? <div className="truncate text-sm">{label}</div> : null}
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label ?? 'Widget switch'}
      />
    </div>
  );
}
