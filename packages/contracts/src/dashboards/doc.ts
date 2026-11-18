import { z } from 'zod';
import { ActionListSchema, WidgetActionSchema } from './actions.ts';
import { ExprSchema, JsonValueSchema } from './expr.ts';
import type { PrimitiveId } from './primitives/index.ts';
import { PrimitiveIdSchema } from './primitives/index.ts';
import { WidgetSourceSchema } from './sources.ts';

export const GRID_STEP = 8;
export const WIDGET_MAX_ITEMS = 30;
export const WIDGET_MAX_SOURCES = 10;

/**
 * Free pixel box: widget on the dashboard canvas and primitive inside a widget
 * both carry `x`/`y`/`w`/`h` in CSS pixels, snapped to `GRID_STEP` by the UI.
 */
export const WidgetRectSchema = z.object({
  x: z.number().int().min(0).multipleOf(GRID_STEP),
  y: z.number().int().min(0).multipleOf(GRID_STEP),
  w: z.number().int().min(GRID_STEP).multipleOf(GRID_STEP),
  h: z.number().int().min(GRID_STEP).multipleOf(GRID_STEP),
});
export type WidgetRect = z.infer<typeof WidgetRectSchema>;

/** Authoring unit of the inner item grid: a twelfth of a 384 px widget body. */
export const ITEM_GRID_STEP = 32;

/** Primitive authoring defaults: 12 columns of 32 px inside a widget. */
export function itemRect(col: number, row: number, w: number, h: number): WidgetRect {
  return {
    x: col * ITEM_GRID_STEP,
    y: row * ITEM_GRID_STEP,
    w: w * ITEM_GRID_STEP,
    h: h * ITEM_GRID_STEP,
  };
}

/**
 * One primitive box inside a widget container subgrid. `props` is static data
 * validated by the primitive descriptor; `bindings` carries data in and `on`
 * carries user events out. The legacy `action` field stays for the `actions`
 * and `button` primitives written before `on` existed.
 */
export const WidgetItemSchema = z.strictObject({
  id: z.string().min(1).max(64),
  primitive: PrimitiveIdSchema,
  title: z.string().min(1).max(120).optional(),
  rect: WidgetRectSchema,
  props: z.record(z.string(), JsonValueSchema).default({}),
  bindings: z.record(z.string(), ExprSchema).default({}),
  on: z.record(z.string().min(1).max(64), ActionListSchema).default({}),
  visibleWhen: ExprSchema.optional(),
  action: WidgetActionSchema.optional(),
});
export type WidgetItem = z.infer<typeof WidgetItemSchema>;

/**
 * Widget document. `items` is the composite form; a doc without items is a
 * legacy single-primitive widget: `primitive` + `config` + optional
 * `transform` (kept for agent-authored and pre-composite widgets).
 */
export const WidgetDocSchema = z.strictObject({
  schemaVersion: z.literal(1),
  title: z.string().min(1).max(120),
  icon: z.string().min(1).max(64).optional(),
  state: z.record(z.string(), JsonValueSchema).default({}),
  persistedState: z.array(z.string().min(1).max(64)).max(100).optional(),
  sources: z.array(WidgetSourceSchema).max(WIDGET_MAX_SOURCES).default([]),
  derived: z.record(z.string().min(1).max(64), ExprSchema).default({}),
  items: z.array(WidgetItemSchema).max(WIDGET_MAX_ITEMS).default([]),
  primitive: PrimitiveIdSchema.default('custom'),
  config: z.record(z.string(), JsonValueSchema).default({}),
  transform: z.string().max(32_000).optional(),
});
export type WidgetDoc = z.infer<typeof WidgetDocSchema>;

export const WidgetNodeSchema: z.ZodType<WidgetNode> = z.lazy(() =>
  z.object({
    primitive: PrimitiveIdSchema,
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(WidgetNodeSchema).optional(),
  }),
);
export interface WidgetNode {
  primitive: PrimitiveId;
  props: Record<string, unknown>;
  children?: WidgetNode[];
}

/** Legacy name of the primitive id union. */
export const WidgetPrimitiveSchema = PrimitiveIdSchema;
export type WidgetPrimitive = PrimitiveId;

export const DashboardWidgetStatusSchema = z.enum(['draft', 'active']);
export type DashboardWidgetStatus = z.infer<typeof DashboardWidgetStatusSchema>;

export const DashboardWidgetSchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  orgId: z.string(),
  rect: WidgetRectSchema,
  doc: WidgetDocSchema,
  status: DashboardWidgetStatusSchema,
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

export const DashboardSummarySchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string(),
  widgetCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const DashboardDetailSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string(),
  widgets: z.array(DashboardWidgetSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DashboardDetail = z.infer<typeof DashboardDetailSchema>;

export const DashboardListResponseSchema = z.object({
  items: z.array(DashboardSummarySchema),
});
export type DashboardListResponse = z.infer<typeof DashboardListResponseSchema>;

export const CreateDashboardBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().nullable().optional(),
  icon: z.string().min(1).max(64).optional(),
});
export type CreateDashboardBody = z.infer<typeof CreateDashboardBodySchema>;

export const UpdateDashboardBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().nullable().optional(),
  icon: z.string().min(1).max(64).optional(),
});
export type UpdateDashboardBody = z.infer<typeof UpdateDashboardBodySchema>;

export const UpsertWidgetBodySchema = z.object({
  rect: WidgetRectSchema,
  doc: WidgetDocSchema,
});
export type UpsertWidgetBody = z.infer<typeof UpsertWidgetBodySchema>;

export const UpdateWidgetBodySchema = z.object({
  rect: WidgetRectSchema.optional(),
  doc: WidgetDocSchema.optional(),
});
export type UpdateWidgetBody = z.infer<typeof UpdateWidgetBodySchema>;

export const LayoutBatchItemSchema = z.object({
  widgetId: z.string(),
  rect: WidgetRectSchema,
});
export type LayoutBatchItem = z.infer<typeof LayoutBatchItemSchema>;

export const UpdateLayoutBodySchema = z.object({
  items: z.array(LayoutBatchItemSchema).min(1).max(100),
});
export type UpdateLayoutBody = z.infer<typeof UpdateLayoutBodySchema>;

/** Scalar value substituted into `{{param:name}}` placeholders of an external source. */
export const WidgetParamValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type WidgetParamValue = z.infer<typeof WidgetParamValueSchema>;

export const WidgetParamsSchema = z.record(z.string(), WidgetParamValueSchema);
export type WidgetParams = z.infer<typeof WidgetParamsSchema>;

/**
 * Runtime data fetch for one declared source of an existing widget.
 * Secrets are resolved server-side only; responses are cached by TTL.
 * `params` are scalars substituted into the source `query` and `body` only.
 */
export const WidgetInvokeBodySchema = z.object({
  sourceId: z.string().min(1),
  params: WidgetParamsSchema.optional(),
});
export type WidgetInvokeBody = z.infer<typeof WidgetInvokeBodySchema>;

/** Dry-run a source definition without persisting it (pack `widgets_test`, editor probe). */
export const WidgetSourceTestBodySchema = z.object({
  source: WidgetSourceSchema,
});
export type WidgetSourceTestBody = z.infer<typeof WidgetSourceTestBodySchema>;
