import { z } from 'zod';
import { STATE_KEY_PROP } from '../interactions.ts';
import { definePrimitive } from './define.ts';

export const switchPrimitive = definePrimitive({
  id: 'switch',
  title: 'Switch',
  description: 'Boolean toggle that emits the new checked state',
  category: 'Interaction',
  layout: { defaultW: 3, defaultH: 1, minW: 1, minH: 1 },
  props: z.object({
    [STATE_KEY_PROP]: z.string().nullish().meta({
      label: 'State key',
      hint: 'When set, the toggle reads and writes this widget state key',
    }),
    checked: z.boolean().nullish().default(false).meta({
      label: 'Checked',
      hint: 'Initial state; the live value lives in the state key when one is set',
      control: 'switch',
    }),
    label: z.string().nullish().meta({ label: 'Label' }),
  }),
  events: {
    change: z.object({ checked: z.boolean() }),
  },
  defaults: { checked: false },
});
