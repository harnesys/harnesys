import { z } from 'zod';
import { ExprSchema } from '../expr.ts';
import { ROW_BINDINGS_PROP } from '../row-bindings.ts';
import { definePrimitive } from './define.ts';

export const listPrimitive = definePrimitive({
  id: 'list',
  title: 'List',
  description: 'Primary/secondary text list with optional badges',
  category: 'Data',
  layout: { defaultW: 4, defaultH: 4, minW: 2, minH: 2 },
  props: z.object({
    items: z
      .array(z.record(z.string(), z.unknown()))
      .nullish()
      .default([])
      .meta({ label: 'Items', hint: 'Array of item objects' }),
    primaryText: z.string().nullish().default('title').meta({ label: 'Primary key' }),
    secondaryText: z.string().nullish().meta({ label: 'Secondary key' }),
    badgeKey: z.string().nullish().meta({ label: 'Badge key' }),
    markdown: z.boolean().nullish().default(false).meta({
      label: 'Markdown',
      hint: 'Render the primary text as Markdown',
      control: 'switch',
    }),
    dismissible: z.boolean().nullish().default(false).meta({
      label: 'Dismiss button',
      hint: 'Trailing button per row emits itemDismiss with the row',
      control: 'switch',
    }),
    [ROW_BINDINGS_PROP]: z.record(z.string(), ExprSchema).nullish().meta({
      label: 'Row bindings',
      hint: 'Item value expressions evaluated per row with the row root',
    }),
  }),
  events: {
    itemClick: z.object({
      row: z.record(z.string(), z.unknown()),
      index: z.number(),
    }),
    itemDismiss: z.object({
      row: z.record(z.string(), z.unknown()),
      index: z.number(),
    }),
  },
  defaults: { primaryText: 'title' },
});
