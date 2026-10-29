import type { CSSProperties } from 'react';

export { ENTITY_COLOR_NAMES } from '@harnesys/contracts';

export const ENTITY_COLOR_CLASSES: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  magenta: 'bg-fuchsia-500',
  cyan: 'bg-cyan-500',
  pink: 'bg-pink-500',
};
export const ENTITY_COLOR_TILE_CLASSES: Record<string, string> = {
  red: 'bg-red-500/15',
  orange: 'bg-orange-500/15',
  yellow: 'bg-yellow-500/15',
  green: 'bg-green-500/15',
  blue: 'bg-blue-500/15',
  purple: 'bg-purple-500/15',
  magenta: 'bg-fuchsia-500/15',
  cyan: 'bg-cyan-500/15',
  pink: 'bg-pink-500/15',
};
export const ENTITY_COLOR_RING_CLASSES: Record<string, string> = {
  red: 'ring-red-500/60',
  orange: 'ring-orange-500/60',
  yellow: 'ring-yellow-500/60',
  green: 'ring-green-500/60',
  blue: 'ring-blue-500/60',
  purple: 'ring-purple-500/60',
  magenta: 'ring-fuchsia-500/60',
  cyan: 'ring-cyan-500/60',
  pink: 'ring-pink-500/60',
};
export const ENTITY_COLOR_TINT_CLASSES: Record<string, string> = {
  red: 'bg-red-500/15 text-red-600 dark:text-red-400',
  orange: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  yellow: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  green: 'bg-green-500/15 text-green-600 dark:text-green-400',
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  magenta: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
  cyan: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  pink: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
};
const NEUTRAL_COLOR_CLASS = 'bg-muted-foreground/40';
const NEUTRAL_TINT_CLASS = 'bg-muted-foreground/10 text-muted-foreground';
export function entityColorClass(color: string | null): string {
  if (color === null) {
    return NEUTRAL_COLOR_CLASS;
  }
  return ENTITY_COLOR_CLASSES[color] ?? NEUTRAL_COLOR_CLASS;
}
export function entityColorTintClass(color: string | null): string {
  if (color === null) {
    return NEUTRAL_TINT_CLASS;
  }
  return ENTITY_COLOR_TINT_CLASSES[color] ?? NEUTRAL_TINT_CLASS;
}
export function isCustomColor(color: string | null): boolean {
  return color?.startsWith('#') === true;
}
export function entityColorTintStyle(color: string | null): CSSProperties {
  if (!isCustomColor(color) || color === null) {
    return {};
  }
  return {
    backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
    color,
  };
}
