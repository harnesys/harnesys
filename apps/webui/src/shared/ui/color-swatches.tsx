import type { CSSProperties, ReactNode } from 'react';
import {
  ENTITY_COLOR_CLASSES,
  ENTITY_COLOR_NAMES,
  ENTITY_COLOR_RING_CLASSES,
  ENTITY_COLOR_TILE_CLASSES,
} from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';

export interface ColorSwatchItem {
  value: string;
  label: string;

  color: string;
}

export function ColorSwatches({
  value,
  onChange,
  testIdPrefix,
  items,
  extraItem,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  testIdPrefix: string;
  items?: ColorSwatchItem[];
  extraItem?: ColorSwatchItem;
}) {
  return (
    <div className="flex w-full items-center gap-1 px-0.5" data-testid={`${testIdPrefix}-picker`}>
      {items ? (
        items.map((item) => (
          <SwatchTile
            key={item.value}
            label={item.label}
            selected={value === item.value}
            testId={`${testIdPrefix}-${item.value}`}
            onClick={() => onChange(item.value)}
            style={{ backgroundColor: tileTint(item.color) }}
            ringColor={value === item.value ? ringTone(item.color) : undefined}
          >
            <span className="size-3.5 rounded-full" style={{ backgroundColor: item.color }} />
          </SwatchTile>
        ))
      ) : (
        <>
          <SwatchTile
            label="Color default"
            selected={value === null}
            testId={`${testIdPrefix}-default`}
            onClick={() => onChange(null)}
            className="bg-muted ring-foreground/60"
          >
            <span className="size-3.5 rounded-full bg-muted-foreground/40" />
          </SwatchTile>
          {extraItem ? (
            <SwatchTile
              key={extraItem.value}
              label={extraItem.label}
              selected={value === extraItem.value}
              testId={`${testIdPrefix}-${extraItem.value}`}
              onClick={() => onChange(extraItem.value)}
              style={{ backgroundColor: tileTint(extraItem.color) }}
              ringColor={value === extraItem.value ? ringTone(extraItem.color) : undefined}
            >
              <span
                className="size-3.5 rounded-full"
                style={{ backgroundColor: extraItem.color }}
              />
            </SwatchTile>
          ) : null}
          {ENTITY_COLOR_NAMES.map((color) => (
            <SwatchTile
              key={color}
              label={`Color ${color}`}
              selected={value === color}
              testId={`${testIdPrefix}-${color}`}
              onClick={() => onChange(value === color ? null : color)}
              className={cn(ENTITY_COLOR_TILE_CLASSES[color], ENTITY_COLOR_RING_CLASSES[color])}
            >
              <span className={cn('size-3.5 rounded-full', ENTITY_COLOR_CLASSES[color])} />
            </SwatchTile>
          ))}
        </>
      )}
    </div>
  );
}
function SwatchTile({
  label,
  selected,
  testId,
  onClick,
  className,
  style,
  ringColor,
  children,
}: {
  label: string;
  selected: boolean;
  testId: string;
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
  ringColor?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex h-7 flex-1 items-center justify-center rounded-md outline-none transition-colors',
        'hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/50',
        selected ? 'ring-2' : '',
        className,
      )}
      style={ringColor ? ({ ...style, '--tw-ring-color': ringColor } as CSSProperties) : style}
    >
      {children}
    </button>
  );
}
function tileTint(color: string): string {
  return `color-mix(in oklab, ${color} 15%, transparent)`;
}
function ringTone(color: string): string {
  return `color-mix(in oklab, ${color} 60%, transparent)`;
}
