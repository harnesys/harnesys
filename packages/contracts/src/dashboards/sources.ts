import { z } from 'zod';
import { ExprSchema } from './expr.ts';
import { parseOrgApiPathShape } from './path-guard.ts';

export const WidgetRefreshModeSchema = z.enum(['manual', 'onMount', 'interval', 'onEvent']);
export type WidgetRefreshMode = z.infer<typeof WidgetRefreshModeSchema>;

export const WidgetRefreshSchema = z.object({
  mode: WidgetRefreshModeSchema,
  intervalSeconds: z.number().int().min(30).max(3600).optional(),
  /** Org event topics from `events/watch` that refetch an `onEvent` source. */
  topics: z.array(z.string().min(1).max(64)).max(20).optional(),
});
export type WidgetRefresh = z.infer<typeof WidgetRefreshSchema>;

export const SourceIdSchema = z.string().min(1).max(64);
export const SourceMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH']);
export type SourceMethod = z.infer<typeof SourceMethodSchema>;

/** Org-scoped API path without a known org: shape check only (see path guard). */
export const OrgApiPathSchema = z
  .string()
  .max(2048)
  .superRefine((value, ctx) => {
    const result = parseOrgApiPathShape(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.reason });
    }
  });

export const OrgApiSourceSchema = z
  .object({
    kind: z.literal('orgApi'),
    id: SourceIdSchema,
    method: SourceMethodSchema.default('GET'),
    path: OrgApiPathSchema,
    query: z.record(z.string(), ExprSchema).optional(),
    body: ExprSchema.optional(),
    refresh: WidgetRefreshSchema.optional(),
  })
  .superRefine((source, ctx) => {
    // Org data is refreshed by push (onEvent) or on demand; the engine never
    // polls our API, so a client-side interval is not a valid mode here.
    if (source.refresh?.mode === 'interval') {
      ctx.addIssue({
        code: 'custom',
        path: ['refresh', 'mode'],
        message: 'interval refresh is only valid for external sources',
      });
    }
  });
export type OrgApiSource = z.infer<typeof OrgApiSourceSchema>;

export const ExternalSourceSchema = z.object({
  kind: z.literal('external'),
  id: SourceIdSchema,
  method: SourceMethodSchema.default('GET'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), ExprSchema).optional(),
  body: ExprSchema.optional(),
  /** Header values may reference vault entries via {{vault:name}}. */
  secretRefs: z.array(z.string()).optional(),
  cacheTtlSeconds: z.number().int().min(0).max(3600).optional(),
  refresh: WidgetRefreshSchema.optional(),
});
export type ExternalSource = z.infer<typeof ExternalSourceSchema>;

export const WidgetSourceSchema = z.discriminatedUnion('kind', [
  OrgApiSourceSchema,
  ExternalSourceSchema,
]);
export type WidgetSource = z.infer<typeof WidgetSourceSchema>;
