import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { entityColorTintClass, entityColorTintStyle } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { ICON_OPTIONS } from '../model/icon-options';

interface IconPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  testIdPrefix: string;
  /** Shows a "no icon" choice; without it a value is always kept. */
  allowNone?: boolean;
  /** Dashboard tint applied to the selected option. */
  color?: string | null;
}

export function IconPicker({
  value,
  onChange,
  testIdPrefix,
  allowNone = false,
  color,
}: IconPickerProps): ReactNode {
  const selectedClass = cn('border-transparent', entityColorTintClass(color ?? null));

  return (
    <div className="flex flex-wrap gap-1.5">
      {allowNone ? (
        <button
          type="button"
          aria-label="No icon"
          aria-pressed={value === null}
          title="No icon"
          className={cn(
            'flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted/60',
            value === null && selectedClass,
          )}
          style={value === null ? entityColorTintStyle(color ?? null) : undefined}
          data-testid={`${testIdPrefix}-none`}
          onClick={() => onChange(null)}
        >
          <XIcon className="size-4" />
        </button>
      ) : null}
      {ICON_OPTIONS.map((option) => {
        const OptionIcon = option.icon;
        const selected = value === option.name;
        return (
          <button
            key={option.name}
            type="button"
            aria-pressed={selected}
            className={cn(
              'flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted/60',
              selected && selectedClass,
            )}
            style={selected ? entityColorTintStyle(color ?? null) : undefined}
            data-testid={`${testIdPrefix}-${option.name}`}
            onClick={() => onChange(option.name)}
          >
            <OptionIcon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
