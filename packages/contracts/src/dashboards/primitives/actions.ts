import { z } from 'zod';
import { definePrimitive } from './define.ts';

export const LegacyActionButtonSchema = z.record(z.string(), z.unknown());
export type LegacyActionButton = z.infer<typeof LegacyActionButtonSchema>;

export const actionsPrimitive = definePrimitive({
  id: 'actions',
  title: 'Actions',
  description: 'Buttons calling the org API or external sources',
  category: 'Interaction',
  layout: { defaultW: 4, defaultH: 2, minW: 2, minH: 1 },
  props: z.object({
    buttons: z
      .array(LegacyActionButtonSchema)
      .nullish()
      .default([])
      .meta({
        label: 'Buttons',
        hint:
          'Legacy buttons: { label, action, confirm?, successMessage? }. action is ' +
          '{ type: "orgApi", path, method?, query?, body? } or { type: "external", sourceId }',
      }),
  }),
  events: {},
  defaults: {},
  hidden: true,
});
