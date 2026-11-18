import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const linkPrimitive = definePrimitive({
  id: 'link',
  title: 'Link',
  description: 'Anchor to an internal app route or an http(s) URL',
  category: 'Content',
  layout: { defaultW: 3, defaultH: 1, minW: 1, minH: 1 },
  props: z.object({
    label: z.string().nullish().default('').meta({
      label: 'Label',
      hint: 'Visible link text; falls back to the target',
    }),
    to: z.string().nullish().default('').meta({
      label: 'Target',
      hint: 'App route starting with /, or an http(s) URL with External on; anything else renders as plain text',
    }),
    external: z.boolean().nullish().catch(false).meta({
      label: 'External',
      hint: 'Open an http(s) URL in a new tab; internal routes stay in the app',
      control: 'switch',
    }),
  }),
  events: {},
  defaults: { label: '', to: '', external: false },
});
