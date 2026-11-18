import { definePack } from '../../domain/pack.ts';
import { createCatalogTools } from './create-catalog-tools.ts';
import { createDashboardTools } from './create-dashboard-tools.ts';
import { createWidgetTools } from './create-widget-tools.ts';
import type { DashboardsPackPort } from './port.ts';
import { dashboardWidgetAuthoringSkill } from './widget-authoring-skill.ts';

export interface DashboardsPackPorts {
  dashboards: DashboardsPackPort;
}

export const dashboardsCapability = definePack<DashboardsPackPorts, Record<string, unknown>>({
  name: 'dashboards',
  version: '1.0.0',
  description:
    'Dashboards: dashboards_create / dashboards_list / dashboards_get / dashboards_update / dashboards_delete / dashboard_catalog_get / dashboard_templates_list / dashboard_templates_get / dashboard_widgets_validate / dashboard_widgets_create / dashboard_widgets_update / dashboard_widgets_delete / dashboard_widgets_move / dashboard_widgets_test',
  icon: 'layout-dashboard',
  meta: {
    tools: [
      {
        name: 'dashboards_create',
        description: 'Create an empty dashboard. Returns the dashboard id.',
      },
      {
        name: 'dashboards_list',
        description: 'List org dashboards with widget counts.',
      },
      {
        name: 'dashboards_get',
        description: 'Full dashboard detail: widgets, rects, docs and draft/active status.',
      },
      { name: 'dashboards_update', description: 'Rename a dashboard.' },
      {
        name: 'dashboards_delete',
        description: 'Delete a dashboard and all its widgets. Destructive.',
      },
      {
        name: 'dashboard_catalog_get',
        description:
          'Org API catalog for widget sources: method, path template, query and response JSON Schema.',
      },
      {
        name: 'dashboard_templates_list',
        description: 'Starter widget templates with id, title, suggested rect and counts.',
      },
      {
        name: 'dashboard_templates_get',
        description: 'Full WidgetDoc of one template, with the org id substituted.',
      },
      {
        name: 'dashboard_widgets_validate',
        description:
          'Dry-run a WidgetDoc without writing: structured { ok, issues: [{ path, message }] }.',
      },
      {
        name: 'dashboard_widgets_create',
        description:
          'Create a widget (rect + WidgetDoc). Lands as draft; a human approves activation in the UI.',
      },
      {
        name: 'dashboard_widgets_update',
        description:
          'Update a widget rect and/or doc; a doc change to an agent-created widget returns to draft.',
      },
      { name: 'dashboard_widgets_delete', description: 'Delete a widget.' },
      {
        name: 'dashboard_widgets_move',
        description: 'Batch-move widgets on the 8 px pixel grid (items of widgetId + rect).',
      },
      {
        name: 'dashboard_widgets_test',
        description: 'Dry-run a source definition: validates url/headers/vault secrets.',
      },
    ],
    skills: ['dashboards-widget-authoring'],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: [
      ...createDashboardTools({ dashboards: ctx.ports.dashboards, resolveScope: () => ctx.scope }),
      ...createCatalogTools({ resolveScope: () => ctx.scope }),
      ...createWidgetTools({ dashboards: ctx.ports.dashboards, resolveScope: () => ctx.scope }),
    ],
    skills: [dashboardWidgetAuthoringSkill],
  }),
});
