import { z } from 'zod';
import { STATE_KEY_PROP } from '../interactions.ts';
import { definePrimitive } from './define.ts';

/** Options are an array of `{ label, value }` objects, never bare strings. */
export const SelectOptionSchema = z.object({
  label: z.string().meta({ label: 'Label' }),
  value: z.string().meta({ label: 'Value' }),
});
export type SelectOption = z.infer<typeof SelectOptionSchema>;

export const selectPrimitive = definePrimitive({
  id: 'select',
  title: 'Select',
  description: 'Dropdown of { label, value } options that emits the chosen value',
  category: 'Interaction',
  layout: { defaultW: 4, defaultH: 2, minW: 2, minH: 2 },
  props: z.object({
    [STATE_KEY_PROP]: z.string().nullish().meta({
      label: 'State key',
      hint: 'When set, the selection is read from and written to this widget state key',
    }),
    value: z.string().nullish().meta({
      label: 'Value',
      hint: 'Selected option when no state key is set; usually bound to a state key',
    }),
    options: z.array(SelectOptionSchema).nullish().default([]).meta({
      label: 'Options',
      hint: 'Array of { label, value } objects',
    }),
    label: z.string().nullish().meta({ label: 'Label' }),
    placeholder: z.string().nullish().meta({ label: 'Placeholder' }),
  }),
  events: {
    change: z.object({ value: z.string() }),
  },
  defaults: { options: [] },
});
