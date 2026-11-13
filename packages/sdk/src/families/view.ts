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

export interface Action {
  id: string;
  label: L10n;
  route: RouteRef;
  confirm?: L10n;
  destructive?: boolean;
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
    }
  | { type: 'form'; title: L10n; fields: FieldSpec[]; submit: RouteRef; confirm?: L10n }
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
  }),
  form: z.object({
    type: z.literal('form'),
    title: L10nSchema,
    fields: z.array(FieldSpecSchema).min(1),
    submit: RouteRefSchema,
    confirm: L10nSchema.optional(),
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
