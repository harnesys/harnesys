import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const dividerPrimitive = definePrimitive({
  id: 'divider',
  title: 'Divider',
  description: 'Horizontal rule that separates widget items',
  category: 'Layout',
  layout: { defaultW: 12, defaultH: 1, minW: 1, minH: 1 },
  props: z.object({}),
  events: {},
  defaults: {},
});
