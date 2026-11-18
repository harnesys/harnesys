import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const markdownPrimitive = definePrimitive({
  id: 'markdown',
  title: 'Markdown',
  description: 'Rendered markdown text',
  category: 'Content',
  layout: { defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  props: z.object({
    text: z.union([z.string(), z.number(), z.boolean()]).nullish().default('').meta({
      label: 'Text',
      hint: 'Markdown content, may be bound to a source value',
      control: 'textarea',
    }),
  }),
  events: {},
  defaults: { text: '' },
});
