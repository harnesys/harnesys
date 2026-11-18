import type { LucideIcon } from 'lucide-react';
import { RectangleHorizontalIcon as ButtonLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { asBool, asString } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';

export const ButtonIcon: LucideIcon = ButtonLucideIcon;

/** Mirrors the descriptor's `variant` enum; an unknown value renders as `default`. */
const VARIANTS = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const;
type ButtonVariant = (typeof VARIANTS)[number];

function asVariant(value: unknown): ButtonVariant {
  const raw = asString(value);
  return VARIANTS.find((variant) => variant === raw) ?? 'default';
}

/**
 * Single interactive button that fills its slot. `disabled` is only on when a
 * boolean `true` survives binding; one click leaves one `click` event.
 */
export function ButtonPrimitive({ props, emit }: PrimitiveComponentProps): ReactNode {
  const label = asString(props.label) ?? 'Button';
  return (
    <Button
      variant={asVariant(props.variant)}
      size="sm"
      disabled={asBool(props.disabled)}
      className="h-full w-full"
      onClick={() => emit('click', {})}
    >
      {label}
    </Button>
  );
}
