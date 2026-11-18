import type { WidgetRect, WidgetSource } from '@harnesys/contracts';
import type { CapabilityScope } from '../../domain/pack.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { DashboardsPackPort } from './port.ts';
import { DOC_SCHEMA, RECT_SCHEMA, SOURCE_SCHEMA } from './schemas.ts';
import { validateWidgetDoc } from './validate-doc.ts';

export interface WidgetToolsDeps {
  dashboards: DashboardsPackPort;
  resolveScope: () => CapabilityScope;
}

interface DashboardIdInput {
  dashboardId: string;
}

interface WidgetIdInput extends DashboardIdInput {
  widgetId: string;
}

interface WidgetCreateInput extends DashboardIdInput {
  rect: WidgetRect;
  doc: Record<string, unknown>;
}

interface WidgetUpdateInput extends WidgetIdInput {
  rect?: WidgetRect;
  doc?: Record<string, unknown>;
}

interface LayoutMoveInput extends DashboardIdInput {
  items: { widgetId: string; rect: WidgetRect }[];
}

interface SourceTestInput {
  source: WidgetSource;
}

interface WidgetValidateInput {
  doc: Record<string, unknown>;
}

export function createWidgetTools(deps: WidgetToolsDeps): ToolDefinition[] {
  return [
    tool('dashboard_widgets_create', {
      group: 'dashboards',
      description:
        'Create a widget on a dashboard: pixel rect plus a WidgetDoc (schemaVersion 1). Load the widget-creator skill (load_skill widget-creator) before composing one, and run dashboard_widgets_validate on the doc first. ' +
        'Sources: orgApi with a path starting /orgs/<orgId>, or external with url/headers/secretRefs where header values reference vault entries as {{vault:name}} — never inline secrets; optional transform JS. Item `props` hold static data, `bindings` carry data in, `on` carries events out. The canvas is a free pixel grid with an 8 px step. ' +
        'IMPORTANT: created widgets land as DRAFT (status draft) and need human approval in the dashboard UI before activation; tell the user to review and approve. Validate external sources first with dashboard_widgets_test.',
      input: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
          rect: RECT_SCHEMA,
          doc: DOC_SCHEMA,
        },
        required: ['dashboardId', 'rect', 'doc'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const input = raw as WidgetCreateInput;
        return await deps.dashboards.createWidget(scope.orgId, input.dashboardId, {
          rect: input.rect,
          doc: input.doc as never,
          draft: true,
        });
      },
    }),
    tool('dashboard_widgets_update', {
      group: 'dashboards',
      description:
        'Update a widget: change its rect and/or its doc (title, items, sources, transform, state, derived). Load the widget-creator skill first and run dashboard_widgets_validate on the new doc. A doc change to an agent-created widget sends it back to draft for human approval; rect-only edits and human-authored widgets keep their current status.',
      input: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
          widgetId: { type: 'string' },
          rect: RECT_SCHEMA,
          doc: DOC_SCHEMA,
        },
        required: ['dashboardId', 'widgetId'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const input = raw as WidgetUpdateInput;
        await deps.dashboards.updateWidget(scope.orgId, input.dashboardId, input.widgetId, {
          ...(input.rect !== undefined ? { rect: input.rect } : {}),
          ...(input.doc !== undefined ? { doc: input.doc as never } : {}),
        });
        return { ok: true, widgetId: input.widgetId };
      },
    }),
    tool('dashboard_widgets_delete', {
      group: 'dashboards',
      description: 'Delete a widget from a dashboard.',
      input: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
          widgetId: { type: 'string' },
        },
        required: ['dashboardId', 'widgetId'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const input = raw as WidgetIdInput;
        await deps.dashboards.deleteWidget(scope.orgId, input.dashboardId, input.widgetId);
        return { ok: true, widgetId: input.widgetId };
      },
    }),
    tool('dashboard_widgets_move', {
      group: 'dashboards',
      description:
        'Batch-move widgets on the pixel grid: items is a list of { widgetId, rect } with x ≥ 0, y ≥ 0, w ≥ 8, h ≥ 8, all multiples of 8. Applies all rects in one call.',
      input: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              properties: {
                widgetId: { type: 'string' },
                rect: RECT_SCHEMA,
              },
              required: ['widgetId', 'rect'],
              additionalProperties: false,
            },
          },
        },
        required: ['dashboardId', 'items'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const input = raw as LayoutMoveInput;
        await deps.dashboards.updateLayout(scope.orgId, input.dashboardId, { items: input.items });
        return { ok: true, moved: input.items.length };
      },
    }),
    tool('dashboard_widgets_test', {
      group: 'dashboards',
      description:
        'Dry-run a widget source definition (orgApi or external) without persisting it: validates the url, headers and vault secret resolution and returns the fetched payload. Use before embedding the source into a widget doc.',
      input: {
        type: 'object',
        properties: {
          source: SOURCE_SCHEMA,
        },
        required: ['source'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const { source } = raw as SourceTestInput;
        return await deps.dashboards.testSource(scope.orgId, source);
      },
    }),
    tool('dashboard_widgets_validate', {
      group: 'dashboards',
      description:
        'Dry-run a WidgetDoc without writing anything and get structured issues: { ok, issues: [{ path, message }] } with dot paths inside the doc. It runs the exact check create and update run - contract schema, props against the primitive descriptor, event names, binding roots, derived cycles, source param placement and callApi/source orgs - so a doc that passes here is accepted by the write path.',
      input: {
        type: 'object',
        properties: {
          doc: DOC_SCHEMA,
        },
        required: ['doc'],
        additionalProperties: false,
      },
      sideEffect: 'pure',
      execute: (raw) => {
        const scope = deps.resolveScope();
        const { doc } = raw as WidgetValidateInput;
        return validateWidgetDoc(scope.orgId, doc);
      },
    }),
  ];
}
