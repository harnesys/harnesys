import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';
import type { FieldSpec } from './field-spec.ts';
import { FieldSpecSchema } from './field-spec.ts';

export const VIEW_SCHEMA_VERSION = 1;

export interface RouteRef {
  route: string;
  params?: Record<string, string>;
}

export interface Column {
  key: string;
  label: L10n;
  format: 'text' | 'datetime' | 'number' | 'badge' | 'link' | 'copy';
}

export interface TableFilter {
  key: string;
  label: L10n;
  /** Static filter options; `optionsFrom` takes precedence when both are set. */
  options?: { value: string; label: string }[];
  /** Options resolved from an add-on-owned GET route. */
  optionsFrom?: { route: string; valueKey: string; labelKey?: string };
}

export interface FormDialogAction {
  id: string;
  label: L10n;
  route: RouteRef;
  confirm?: L10n;
  destructive?: boolean;
}

export interface Action {
  id: string;
  label: L10n;
  route: RouteRef;
  confirm?: L10n;
  destructive?: boolean;
  /** Render as a switch bound to `checkedKey`, or as a modal form over `fields`. */
  kind?: 'switch' | 'form';
  /** Row field holding the switch state; requires `kind: 'switch'`. */
  checkedKey?: string;
  /** Form fields for the modal; requires `kind: 'form'`. */
  fields?: FieldSpec[];
  /** Maps form field keys to row keys for initial values; requires `kind: 'form'`. */
  prefill?: Record<string, string>;
  /** Extra footer buttons inside the `kind: 'form'` dialog (e.g. test, delete). */
  formActions?: FormDialogAction[];
  /** Header master switch POSTs this route with `{ enabled }` to set every row in the filter context. */
  batchRoute?: RouteRef;
}

export type ViewSection =
  | { type: 'status' }
  | { type: 'capabilities' }
  | { type: 'permissions' }
  | { type: 'config'; fields?: string[] }
  | { type: 'connections'; connections?: string[] }
  | { type: 'automations'; triggers?: string[] }
  | { type: 'jobs' }
  | {
      type: 'table';
      title: L10n;
      source: RouteRef;
      columns: Column[];
      rowActions?: Action[];
      pageSize?: number;
      /** Render checkboxes and enable `selectionActions` on selected rows. */
      selectable?: boolean;
      /** Bulk actions POSTed once with `{ ids }` of the selected rows. */
      selectionActions?: Action[];
      /** Actions rendered in the section header (e.g. a create-form button). */
      headerActions?: Action[];
      /** Filters rendered above the rows; each adds `key=value` to the source query and to action calls as the filter context. */
      filters?: TableFilter[];
      /** Render a text search input filtering the loaded rows client-side. */
      search?: boolean;
    }
  | {
      type: 'form';
      title: L10n;
      fields: FieldSpec[];
      submit: RouteRef;
      confirm?: L10n /** Render as a modal opened by a button labeled with the title. */;
      modal?: boolean;
    }
  | { type: 'actions'; actions: Action[] }
  | { type: 'markdown'; body: L10n }
  | { type: 'frame'; route: string; height?: number };

export interface ViewDescriptor {
  id: string;
  title: L10n;
  icon?: string;
  sections: ViewSection[];
}

export const RouteRefSchema = z.object({
  route: z.string().min(1),
  params: z.record(z.string(), z.string()).optional(),
});

export const ColumnSchema = z.object({
  key: z.string().min(1),
  label: L10nSchema,
  format: z.enum(['text', 'datetime', 'number', 'badge', 'link', 'copy']),
});

export const ActionSchema = z.object({
  id: z.string().min(1),
  label: L10nSchema,
  route: RouteRefSchema,
  confirm: L10nSchema.optional(),
  destructive: z.boolean().optional(),
  kind: z.enum(['switch', 'form']).optional(),
  checkedKey: z.string().min(1).optional(),
  fields: z.array(FieldSpecSchema).optional(),
  prefill: z.record(z.string(), z.string()).optional(),
  formActions: z
    .array(
      z.object({
        id: z.string().min(1),
        label: L10nSchema,
        route: RouteRefSchema,
        confirm: L10nSchema.optional(),
        destructive: z.boolean().optional(),
      }),
    )
    .optional(),
  batchRoute: RouteRefSchema.optional(),
});

export const TableFilterSchema = z.object({
  key: z.string().min(1),
  label: L10nSchema,
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(1)
    .optional(),
  optionsFrom: z
    .object({
      route: z.string().min(1),
      valueKey: z.string().min(1),
      labelKey: z.string().min(1).optional(),
    })
    .optional(),
});

const baseSections = {
  status: z.object({ type: z.literal('status') }),
  capabilities: z.object({ type: z.literal('capabilities') }),
  permissions: z.object({ type: z.literal('permissions') }),
  config: z.object({ type: z.literal('config'), fields: z.array(z.string()).optional() }),
  connections: z.object({
    type: z.literal('connections'),
    connections: z.array(z.string()).optional(),
  }),
  automations: z.object({
    type: z.literal('automations'),
    triggers: z.array(z.string()).optional(),
  }),
  jobs: z.object({ type: z.literal('jobs') }),
  table: z.object({
    type: z.literal('table'),
    title: L10nSchema,
    source: RouteRefSchema,
    columns: z.array(ColumnSchema).min(1),
    rowActions: z.array(ActionSchema).optional(),
    pageSize: z.number().int().positive().optional(),
    selectable: z.boolean().optional(),
    selectionActions: z.array(ActionSchema).optional(),
    headerActions: z.array(ActionSchema).optional(),
    filters: z.array(TableFilterSchema).optional(),
    search: z.boolean().optional(),
  }),
  form: z.object({
    type: z.literal('form'),
    title: L10nSchema,
    fields: z.array(FieldSpecSchema).min(1),
    submit: RouteRefSchema,
    confirm: L10nSchema.optional(),
    modal: z.boolean().optional(),
  }),
  actions: z.object({ type: z.literal('actions'), actions: z.array(ActionSchema).min(1) }),
  markdown: z.object({ type: z.literal('markdown'), body: L10nSchema }),
  frame: z.object({
    type: z.literal('frame'),
    route: z.string().min(1),
    height: z.number().int().positive().optional(),
  }),
};

export const ViewSectionSchema = z.union([
  baseSections.status,
  baseSections.capabilities,
  baseSections.permissions,
  baseSections.config,
  baseSections.connections,
  baseSections.automations,
  baseSections.jobs,
  baseSections.table,
  baseSections.form,
  baseSections.actions,
  baseSections.markdown,
  baseSections.frame,
]);

export const ViewDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  icon: z.string().optional(),
  sections: z.array(ViewSectionSchema).min(1),
});

export const viewFamily = {
  family: 'view',
  versions: [VIEW_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== VIEW_SCHEMA_VERSION) {
      throw new Error(`view descriptor schema version ${v} is not supported`);
    }
    return ViewDescriptorSchema;
  },
};
