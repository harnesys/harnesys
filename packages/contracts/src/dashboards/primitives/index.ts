import { z } from 'zod';
import { actionsPrimitive } from './actions.ts';
import { badgePrimitive } from './badge.ts';
import { buttonPrimitive } from './button.ts';
import { chartPrimitive } from './chart.ts';
import { customPrimitive } from './custom.ts';
import { dividerPrimitive } from './divider.ts';
import { gaugePrimitive } from './gauge.ts';
import { inputPrimitive } from './input.ts';
import { kvPrimitive } from './kv.ts';
import { linkPrimitive } from './link.ts';
import { listPrimitive } from './list.ts';
import { markdownPrimitive } from './markdown.ts';
import { metricPrimitive } from './metric.ts';
import { progressPrimitive } from './progress.ts';
import { selectPrimitive } from './select.ts';
import { switchPrimitive } from './switch.ts';
import { tablePrimitive } from './table.ts';
import { textPrimitive } from './text.ts';

export const PRIMITIVES = [
  metricPrimitive,
  gaugePrimitive,
  progressPrimitive,
  chartPrimitive,
  tablePrimitive,
  listPrimitive,
  kvPrimitive,
  badgePrimitive,
  markdownPrimitive,
  selectPrimitive,
  switchPrimitive,
  linkPrimitive,
  dividerPrimitive,
  buttonPrimitive,
  textPrimitive,
  inputPrimitive,
  actionsPrimitive,
  customPrimitive,
] as const;

export type Primitive = (typeof PRIMITIVES)[number];

type PrimitiveIdOf<T> = T extends { readonly id: infer TId } ? TId : never;

export type PrimitiveId = PrimitiveIdOf<Primitive>;

function idsOf(primitives: readonly Primitive[]): readonly PrimitiveId[] {
  return primitives.map((primitive) => primitive.id);
}

export const PRIMITIVE_IDS = idsOf(PRIMITIVES);

export const PrimitiveIdSchema = z.enum(PRIMITIVE_IDS);

export function primitiveById(id: string): Primitive | undefined {
  return PRIMITIVES.find((primitive) => primitive.id === id);
}

export { actionsPrimitive } from './actions.ts';
export { BadgeToneSchema, badgePrimitive } from './badge.ts';
export { buttonPrimitive } from './button.ts';
export { chartPrimitive } from './chart.ts';
export { customPrimitive } from './custom.ts';
export type { PrimitiveDescriptor, PrimitiveLayout } from './define.ts';
export { definePrimitive } from './define.ts';
export { dividerPrimitive } from './divider.ts';
export { gaugePrimitive } from './gauge.ts';
export { inputPrimitive } from './input.ts';
export { KvPairSchema, kvPrimitive } from './kv.ts';
export { linkPrimitive } from './link.ts';
export { listPrimitive } from './list.ts';
export { markdownPrimitive } from './markdown.ts';
export { metricPrimitive } from './metric.ts';
export { progressPrimitive } from './progress.ts';
export { SelectOptionSchema, selectPrimitive } from './select.ts';
export { switchPrimitive } from './switch.ts';
export { tablePrimitive } from './table.ts';
export { textPrimitive } from './text.ts';
