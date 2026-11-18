import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const BadgeToneSchema = z.enum(['neutral', 'success', 'warning', 'danger', 'info']);
export type BadgeTone = z.infer<typeof BadgeToneSchema>;

export const badgePrimitive = definePrimitive({
  id: 'badge',
  title: 'Badge',
  description: 'Short status label with a semantic tone',
  category: 'Content',
  layout: { defaultW: 2, defaultH: 1, minW: 1, minH: 1 },
  props: z.object({
    value: z
      .union([z.string(), z.number(), z.boolean()])
      .nullish()
      .default('')
      .meta({ label: 'Value', hint: 'Badge text, usually bound to a source or state value' }),
    tone: BadgeToneSchema.catch('neutral').default('neutral').meta({ label: 'Tone' }),
  }),
  events: {},
  defaults: { value: '', tone: 'neutral' },
});
