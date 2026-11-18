import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const chartPrimitive = definePrimitive({
  id: 'chart',
  title: 'Chart',
  description: 'Line, bar, area or pie chart',
  category: 'Charts',
  layout: { defaultW: 6, defaultH: 4, minW: 3, minH: 2 },
  props: z.object({
    data: z
      .array(z.record(z.string(), z.unknown()))
      .nullish()
      .default([])
      .meta({ label: 'Data', hint: 'Array of row objects' }),
    kind: z.enum(['line', 'bar', 'area', 'pie']).nullish().default('line').meta({ label: 'Kind' }),
    xKey: z.string().nullish().default('name').meta({
      label: 'X key',
      hint: 'Category field; pie uses it as the slice name',
    }),
    yKey: z.string().nullish().meta({
      label: 'Y key',
      hint: 'Numeric key; inferred from the data when empty',
    }),
    yKeys: z.array(z.string()).nullish().meta({
      label: 'Y keys',
      hint: 'One numeric key per series; overrides yKey. Pie uses the first key as the slice value',
    }),
    colors: z.array(z.string()).nullish().meta({
      label: 'Colors',
      hint: 'CSS colors per series (per slice for pie); palette used when empty',
    }),
  }),
  events: {
    pointClick: z.object({
      point: z.record(z.string(), z.unknown()),
      index: z.number(),
    }),
  },
  defaults: { kind: 'line' },
});
