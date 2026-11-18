import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const buttonPrimitive = definePrimitive({
  id: 'button',
  title: 'Button',
  description: 'Dispatches an action: state change, API call, refetch',
  category: 'Interaction',
  layout: { defaultW: 3, defaultH: 1, minW: 1, minH: 1 },
  props: z.object({
    label: z.string().nullish().default('Button').meta({ label: 'Label' }),
    variant: z
      .enum(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'])
      .nullish()
      .default('default')
      .meta({ label: 'Variant' }),
    disabled: z.boolean().nullish().meta({
      label: 'Disabled',
      hint: 'Usually bound to a state or derived value',
      control: 'switch',
    }),
  }),
  events: {
    click: z.object({}),
  },
  defaults: { label: 'Button', variant: 'default' },
});
