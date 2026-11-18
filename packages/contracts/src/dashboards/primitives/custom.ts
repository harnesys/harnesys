import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const customPrimitive = definePrimitive({
  id: 'custom',
  title: 'Custom',
  description: 'Node tree produced by a transform',
  category: 'Transform',
  layout: { defaultW: 6, defaultH: 4, minW: 3, minH: 2 },
  props: z.object({}),
  events: {},
  defaults: {},
  hidden: true,
});
