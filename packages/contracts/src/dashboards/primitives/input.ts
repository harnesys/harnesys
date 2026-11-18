import { z } from 'zod';
import { STATE_KEY_PROP } from '../interactions.ts';
import { definePrimitive } from './define.ts';

export const inputPrimitive = definePrimitive({
  id: 'input',
  title: 'Input',
  description: 'Text field two-way bound to a widget state key',
  category: 'Interaction',
  layout: { defaultW: 4, defaultH: 2, minW: 2, minH: 2 },
  props: z.object({
    [STATE_KEY_PROP]: z.string().min(1).default('value').meta({
      label: 'State key',
      hint: 'Required: every keystroke is written to this state key and emitted as change',
    }),
    label: z.string().nullish().meta({ label: 'Label' }),
    placeholder: z.string().nullish().meta({ label: 'Placeholder' }),
  }),
  events: {
    change: z.object({ value: z.string() }),
  },
  defaults: { [STATE_KEY_PROP]: 'value' },
});
