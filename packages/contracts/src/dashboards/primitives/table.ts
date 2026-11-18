import { z } from 'zod';
import { ExprSchema } from '../expr.ts';
import { ROW_BINDINGS_PROP } from '../row-bindings.ts';
import { definePrimitive } from './define.ts';

export const TableColumnSchema = z.object({
  key: z.string().min(1).meta({ label: 'Key' }),
  label: z.string().min(1).meta({ label: 'Label' }),
  format: z
    .enum(['text', 'number', 'date', 'badge', 'link'])
    .default('text')
    .meta({ label: 'Format', hint: 'Cell rendering' }),
});
export type TableColumn = z.infer<typeof TableColumnSchema>;

export const tablePrimitive = definePrimitive({
  id: 'table',
  title: 'Table',
  description: 'Tabular rows with sortable headers and per-column formats',
  category: 'Data',
  layout: { defaultW: 6, defaultH: 4, minW: 3, minH: 2 },
  props: z.object({
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .nullish()
      .default([])
      .meta({ label: 'Rows', hint: 'Array of row objects' }),
    columns: z.array(TableColumnSchema).nullish().default([]).meta({ label: 'Columns' }),
    sortable: z.boolean().nullish().default(true).meta({ label: 'Sortable' }),
    maxRows: z.number().int().min(1).max(5000).nullish().default(100).meta({ label: 'Max rows' }),
    [ROW_BINDINGS_PROP]: z.record(z.string(), ExprSchema).nullish().meta({
      label: 'Row bindings',
      hint: 'Column value expressions evaluated per row with the row root',
    }),
  }),
  events: {
    rowClick: z.object({
      row: z.record(z.string(), z.unknown()),
      index: z.number(),
    }),
  },
  defaults: { sortable: true, maxRows: 100 },
});
