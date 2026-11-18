import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const metricPrimitive = definePrimitive({
  id: 'metric',
  title: 'Metric',
  description: 'Big number with optional delta and sparkline',
  category: 'Metrics',
  layout: { defaultW: 3, defaultH: 2, minW: 2, minH: 2 },
  props: z.object({
    value: z.union([z.number(), z.string()]).nullish().meta({
      label: 'Value',
      hint: 'Number, usually bound to a source or state value',
      control: 'number',
    }),
    label: z.string().nullish().meta({ label: 'Label' }),
    delta: z.union([z.number(), z.string()]).nullish().meta({
      label: 'Delta',
      hint: 'Shown in Format; positive renders up, negative down',
      control: 'number',
    }),
    deltaLabel: z.string().nullish().meta({ label: 'Delta label' }),
    format: z.enum(['number', 'percent', 'currency', 'compact']).nullish().default('number').meta({
      label: 'Format',
      hint: 'Percent expects a 0-1 fraction (0.42 renders 42%); currency renders USD',
    }),
    sparkline: z.array(z.number()).nullish().meta({
      label: 'Sparkline',
      hint: 'Array of numbers',
    }),
  }),
  events: {},
  defaults: { format: 'number' },
});
