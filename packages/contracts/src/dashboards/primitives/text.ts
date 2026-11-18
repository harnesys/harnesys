import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const textPrimitive = definePrimitive({
  id: 'text',
  title: 'Text',
  description: 'Plain text bound to state or source values',
  category: 'Content',
  layout: { defaultW: 4, defaultH: 1, minW: 1, minH: 1 },
  props: z.object({
    text: z
      .union([z.string(), z.number(), z.boolean()])
      .nullish()
      .default('')
      .meta({ label: 'Text', hint: 'Usually bound to a state or source value' }),
    label: z.string().nullish().meta({ label: 'Overline' }),
  }),
  events: {},
  defaults: { text: '' },
});
