import type { CapabilityScope } from '../../domain/pack.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { DashboardsPackPort } from './port.ts';

export interface DashboardToolsDeps {
  dashboards: DashboardsPackPort;
  resolveScope: () => CapabilityScope;
}

interface DashboardNameInput {
  name: string;
}

interface DashboardIdInput {
  dashboardId: string;
}

export function createDashboardTools(deps: DashboardToolsDeps): ToolDefinition[] {
  return [
    tool('dashboards_create', {
      group: 'dashboards',
      description: 'Create an empty dashboard with the given name. Returns the dashboard id.',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
        },
        required: ['name'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const name = (raw as DashboardNameInput).name;
        return await deps.dashboards.createDashboard(scope.orgId, name);
      },
    }),
    tool('dashboards_list', {
      group: 'dashboards',
      description: 'List dashboards of this org with id, name and widget counts.',
      input: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      sideEffect: 'read',
      execute: async () => {
        const scope = deps.resolveScope();
        return await deps.dashboards.listDashboards(scope.orgId);
      },
    }),
    tool('dashboards_get', {
      group: 'dashboards',
      description:
        'Full dashboard detail: name, widgets with their pixel rects, docs (sources, transform, config) and draft/active status.',
      input: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
        },
        required: ['dashboardId'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const { dashboardId } = raw as DashboardIdInput;
        return await deps.dashboards.getDashboard(scope.orgId, dashboardId);
      },
    }),
    tool('dashboards_update', {
      group: 'dashboards',
      description: 'Rename a dashboard.',
      input: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
          name: { type: 'string', minLength: 1, maxLength: 120 },
        },
        required: ['dashboardId', 'name'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const input = raw as DashboardIdInput & DashboardNameInput;
        await deps.dashboards.updateDashboard(scope.orgId, input.dashboardId, input.name);
        return { ok: true, dashboardId: input.dashboardId };
      },
    }),
    tool('dashboards_delete', {
      group: 'dashboards',
      description:
        'Delete a dashboard and all its widgets. Destructive and irreversible; confirm with the user first.',
      input: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
        },
        required: ['dashboardId'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const scope = deps.resolveScope();
        const { dashboardId } = raw as DashboardIdInput;
        await deps.dashboards.deleteDashboard(scope.orgId, dashboardId);
        return { ok: true, dashboardId };
      },
    }),
  ];
}
