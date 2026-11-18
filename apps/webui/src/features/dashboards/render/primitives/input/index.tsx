import type { LucideIcon } from 'lucide-react';
import { TextCursorInputIcon as InputLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/shared/ui/input';
import { asString, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';
import { useStateKeyProp } from '../use-state-key';

export const InputIcon: LucideIcon = InputLucideIcon;

/**
 * Text input two-way bound to a widget state key. `stateKey` is required by the
 * descriptor, so there is no unbound editing mode: the field reads the live
 * value from the state key and writes every keystroke back, emitting `change`
 * for the same keystroke.
 */
export function InputPrimitive({ props, emit }: PrimitiveComponentProps): ReactNode {
  const binding = useStateKeyProp(props);
  const label = asString(props.label);

  if (!binding.available) {
    return <WidgetEmptyState message="Input requires the widget runtime" />;
  }
  if (!binding.bound) {
    return <WidgetEmptyState message="Input needs a state key" />;
  }

  const value = asText(binding.value) ?? '';

  const onChange = (next: string): void => {
    binding.set(next);
    emit('change', { value: next });
  };

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 p-1">
      {label ? <div className="text-[10px] text-muted-foreground uppercase">{label}</div> : null}
      <Input
        value={value}
        placeholder={asString(props.placeholder)}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label ?? 'Widget input'}
      />
    </div>
  );
}
