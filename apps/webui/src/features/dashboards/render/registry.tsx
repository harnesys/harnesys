import type { PrimitiveId } from '@harnesys/contracts';
import { PRIMITIVE_IDS, primitiveById } from '@harnesys/contracts';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ActionsIcon, ActionsPrimitive } from './primitives/actions';
import { BadgeIcon, BadgePrimitive } from './primitives/badge';
import { ButtonIcon, ButtonPrimitive } from './primitives/button';
import { ChartIcon, ChartPrimitive } from './primitives/chart';
import { CustomIcon, CustomPrimitive } from './primitives/custom';
import { DividerIcon, DividerPrimitive } from './primitives/divider';
import { GaugeIcon, GaugePrimitive } from './primitives/gauge';
import { InputIcon, InputPrimitive } from './primitives/input';
import { KvIcon, KvPrimitive } from './primitives/kv';
import { LinkIcon, LinkPrimitive } from './primitives/link';
import { ListIcon, ListPrimitive } from './primitives/list';
import { MarkdownIcon, MarkdownPrimitive } from './primitives/markdown';
import { MetricIcon, MetricPrimitive } from './primitives/metric';
import type { PrimitiveComponentProps, PrimitiveEmit } from './primitives/primitive-props';
import { ProgressIcon, ProgressPrimitive } from './primitives/progress';
import { SelectIcon, SelectPrimitive } from './primitives/select';
import { SwitchIcon, SwitchPrimitive } from './primitives/switch';
import { TableIcon, TablePrimitive } from './primitives/table';
import { TextIcon, TextPrimitive } from './primitives/text';

export type PrimitiveComponent = (props: PrimitiveComponentProps) => ReactNode;

export interface PrimitiveEntry {
  id: PrimitiveId;
  icon: LucideIcon;
  Component: PrimitiveComponent;
}

export const NOOP_EMIT: PrimitiveEmit = () => {};

/** One registration line per primitive; a missing id fails `tsc` (plan 3.4). */
export const PRIMITIVE_COMPONENTS = {
  metric: { id: 'metric', icon: MetricIcon, Component: MetricPrimitive },
  gauge: { id: 'gauge', icon: GaugeIcon, Component: GaugePrimitive },
  progress: { id: 'progress', icon: ProgressIcon, Component: ProgressPrimitive },
  chart: { id: 'chart', icon: ChartIcon, Component: ChartPrimitive },
  table: { id: 'table', icon: TableIcon, Component: TablePrimitive },
  list: { id: 'list', icon: ListIcon, Component: ListPrimitive },
  kv: { id: 'kv', icon: KvIcon, Component: KvPrimitive },
  badge: { id: 'badge', icon: BadgeIcon, Component: BadgePrimitive },
  markdown: { id: 'markdown', icon: MarkdownIcon, Component: MarkdownPrimitive },
  select: { id: 'select', icon: SelectIcon, Component: SelectPrimitive },
  switch: { id: 'switch', icon: SwitchIcon, Component: SwitchPrimitive },
  link: { id: 'link', icon: LinkIcon, Component: LinkPrimitive },
  divider: { id: 'divider', icon: DividerIcon, Component: DividerPrimitive },
  button: { id: 'button', icon: ButtonIcon, Component: ButtonPrimitive },
  text: { id: 'text', icon: TextIcon, Component: TextPrimitive },
  input: { id: 'input', icon: InputIcon, Component: InputPrimitive },
  actions: { id: 'actions', icon: ActionsIcon, Component: ActionsPrimitive },
  custom: { id: 'custom', icon: CustomIcon, Component: CustomPrimitive },
} satisfies Record<PrimitiveId, PrimitiveEntry>;

export function getPrimitiveComponent(id: PrimitiveId): PrimitiveEntry {
  return PRIMITIVE_COMPONENTS[id];
}

export interface WidgetDefinitionMeta {
  primitive: PrimitiveId;
  title: string;
  description: string;
  category: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}

function metaOf(id: PrimitiveId): WidgetDefinitionMeta {
  const descriptor = primitiveById(id);
  if (!descriptor) {
    throw new Error(`Missing primitive descriptor: ${id}`);
  }
  return {
    primitive: id,
    title: descriptor.title,
    description: descriptor.description,
    category: descriptor.category,
    ...descriptor.layout,
  };
}

/** Layout/meta for palettes and editors, derived from the contracts descriptors. */
export const PRIMITIVE_REGISTRY = Object.fromEntries(
  PRIMITIVE_IDS.map((id) => [id, metaOf(id)]),
) as Record<PrimitiveId, WidgetDefinitionMeta>;
