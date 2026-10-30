import { z } from 'zod';

export type EntityColorName =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'magenta'
  | 'cyan'
  | 'pink';

export const EntityColorSchema = z.enum([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'magenta',
  'cyan',
  'pink',
]);

export const ENTITY_COLOR_NAMES: readonly EntityColorName[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'magenta',
  'cyan',
  'pink',
];

export const ENTITY_COLOR_HEX: Record<EntityColorName, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  magenta: '#d946ef',
  cyan: '#06b6d4',
  pink: '#ec4899',
};
