import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const gaugePrimitive = definePrimitive({
  id: 'gauge',
  title: 'Gauge',
  description: 'Arc gauge for a bounded value',
  category: 'Metrics',
  layout: { defaultW: 3, defaultH: 3, minW: 2, minH: 2 },
  props: z.object({
    value: z.union([z.number(), z.string()]).nullish().meta({
      label: 'Value',
      hint: 'Number, usually bound to a source or state value',
      control: 'number',
    }),
    min: z.number().nullish().default(0).meta({ label: 'Min', hint: 'Lower bound of the arc' }),
    max: z.number().nullish().default(100).meta({
      label: 'Max',
      hint: 'Upper bound; a Max not greater than Min falls back to 0-100',
    }),
    label: z.string().nullish().meta({ label: 'Label' }),
  }),
  events: {},
  defaults: { min: 0, max: 100 },
});
