import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const agentRosterTemplate = defineWidgetTemplate({
  id: 'agent-roster',
  title: 'Agent roster',
  description: 'Installed agents with role, model and status.',
  rect: { x: 0, y: 0, w: 408, h: 320 },
  doc: {
    schemaVersion: 1,
    title: 'Agents',
    icon: 'server',
    primitive: 'custom',
    state: {},
    sources: [
      {
        kind: 'orgApi',
        id: 'agents',
        method: 'GET',
        path: '/orgs/:orgId/agents',
        refresh: { mode: 'onEvent', topics: ['desk'] },
      },
    ],
    derived: {},
    config: {},
    items: [
      {
        id: 'roster',
        primitive: 'table',
        title: 'Agent roster',
        rect: itemRect(0, 0, 12, 8),
        props: {
          columns: [
            { key: 'name', label: 'Agent', format: 'text' },
            { key: 'role', label: 'Role', format: 'text' },
            { key: 'modelId', label: 'Model', format: 'text' },
            { key: 'status', label: 'Status', format: 'badge' },
          ],
          sortable: true,
          maxRows: 50,
        },
        bindings: { rows: { ref: 'sources.agents.items' } },
        on: {},
      },
    ],
  },
});
