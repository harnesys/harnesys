import type { JsonValue, PrimitiveId, WidgetItem } from '@harnesys/contracts';
import {
  ITEM_GRID_STEP,
  JsonValueSchema,
  PRIMITIVES,
  type Primitive,
  primitiveById,
} from '@harnesys/contracts';
import { LayoutDashboardIcon, type LucideIcon } from 'lucide-react';
import { PRIMITIVE_COMPONENTS } from '../render/registry';
import type { PropFieldSpec } from './prop-fields';

function isHidden(primitive: Primitive): boolean {
  return 'hidden' in primitive && primitive.hidden === true;
}

/** Primitives offered in the widget "Add primitive" palette, in contracts order. */
export function palettePrimitives(): Primitive[] {
  return PRIMITIVES.filter((primitive) => !isHidden(primitive));
}

/** Primitives offered in the item switcher: legacy ones stay editable. */
export function formPrimitives(): Primitive[] {
  return [...PRIMITIVES];
}

export function primitiveTitle(primitive: string): string {
  return primitiveById(primitive)?.title ?? primitive;
}

/** Palette icon from the renderer registration; unknown ids keep the dashboard mark. */
export function primitiveIcon(primitive: string): LucideIcon {
  const descriptor = primitiveById(primitive);
  return descriptor ? PRIMITIVE_COMPONENTS[descriptor.id].icon : LayoutDashboardIcon;
}

/** Event names declared by the primitive descriptor, e.g. `click` for a button. */
export function primitiveEvents(primitive: string): string[] {
  return Object.keys(primitiveById(primitive)?.events ?? {});
}

/** Descriptor defaults narrowed to JSON values; non-JSON defaults are dropped. */
export function defaultPropsFor(primitive: string): Record<string, JsonValue> {
  const props: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(primitiveById(primitive)?.defaults ?? {})) {
    const parsed = JsonValueSchema.safeParse(value);
    if (parsed.success) {
      props[key] = parsed.data;
    }
  }
  return props;
}

function nextItemId(items: WidgetItem[]): string {
  let index = items.length + 1;
  const taken = new Set(items.map((item) => item.id));
  while (taken.has(`item-${index}`)) {
    index += 1;
  }
  return `item-${index}`;
}

/** New primitive box appended below the current content of a composite widget. */
export function defaultWidgetItem(primitive: PrimitiveId, items: WidgetItem[]): WidgetItem {
  const layout = primitiveById(primitive)?.layout;
  const bottom = items.reduce((max, item) => Math.max(max, item.rect.y + item.rect.h), 0);
  return {
    id: nextItemId(items),
    primitive,
    rect: {
      x: 0,
      y: bottom,
      w: (layout?.defaultW ?? 4) * ITEM_GRID_STEP,
      h: (layout?.defaultH ?? 2) * ITEM_GRID_STEP,
    },
    props: defaultPropsFor(primitive),
    bindings: {},
    on: {},
  };
}

/** Compact the editor's text field into the typed JSON value the schema expects. */
export function coercePropValue(spec: PropFieldSpec, raw: string): JsonValue | undefined {
  if (spec.valueKind === 'number') {
    if (raw.trim() === '') {
      return undefined;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  if (spec.valueKind === 'boolean') {
    return raw === 'true' ? true : undefined;
  }
  if (spec.valueKind === 'json') {
    if (raw.trim() === '') {
      return undefined;
    }
    try {
      const parsed = JsonValueSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }
  return raw === '' ? undefined : raw;
}

/** Key-order-insensitive deep equality; arrays stay order-sensitive. */
export function sameWidgetDoc(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return a === b;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((entry, index) => sameWidgetDoc(entry, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord).filter((key) => aRecord[key] !== undefined);
  const bKeys = Object.keys(bRecord).filter((key) => bRecord[key] !== undefined);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => key in bRecord && sameWidgetDoc(aRecord[key], bRecord[key]));
}

/** Render a stored prop value back into the editor's text form. */
export function propToFormValue(spec: PropFieldSpec, value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (spec.valueKind === 'json') {
    return JSON.stringify(value, null, 2);
  }
  return typeof value === 'string' ? value : String(value);
}
