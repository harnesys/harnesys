import { z } from 'zod';
import { definePrimitive } from './define.ts';

const KvScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

/** One row of the key-value panel; any JSON scalar renders as text. */
export const KvPairSchema = z.object({
  label: KvScalarSchema.meta({ label: 'Label' }),
  value: KvScalarSchema.meta({ label: 'Value' }),
});
export type KvPair = z.infer<typeof KvPairSchema>;

export const kvPrimitive = definePrimitive({
  id: 'kv',
  title: 'Key-value',
  description: 'Compact list of label/value pairs',
  category: 'Data',
  layout: { defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  props: z.object({
    pairs: z.array(KvPairSchema).nullish().default([]).meta({
      label: 'Pairs',
      hint: 'Array of { label, value } objects',
    }),
  }),
  events: {},
  defaults: { pairs: [] },
});
