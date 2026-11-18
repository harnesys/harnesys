import type { z } from 'zod';

export interface PrimitiveLayout {
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}

export interface PrimitiveDescriptor<TProps extends z.ZodType = z.ZodType> {
  id: string;
  title: string;
  description: string;
  category: string;
  layout: PrimitiveLayout;
  props: TProps;
  events: Record<string, z.ZodType>;
  defaults: Record<string, unknown>;
  /** Legacy primitive: kept for existing documents, not offered in the palette. */
  hidden?: boolean;
}

/** Identity helper that keeps the literal `id` and the props schema type. */
export function definePrimitive<const D extends PrimitiveDescriptor>(descriptor: D): D {
  return descriptor;
}
