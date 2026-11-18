import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const progressPrimitive = definePrimitive({
  id: 'progress',
  title: 'Progress',
  description: 'Horizontal bar for a value within a maximum',
  category: 'Metrics',
  layout: { defaultW: 4, defaultH: 2, minW: 2, minH: 1 },
  props: z.object({
    value: z.union([z.number(), z.string()]).nullish().meta({
      label: 'Value',
      hint: 'Current amount, usually bound to a source or state value',
      control: 'number',
    }),
    max: z.number().positive().nullish().default(100).meta({
      label: 'Maximum',
      hint: 'Upper bound of the bar; must be greater than 0',
    }),
    label: z.string().nullish().meta({ label: 'Label' }),
  }),
  events: {},
  defaults: { max: 100 },
});
