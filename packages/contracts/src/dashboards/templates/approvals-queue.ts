import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const approvalsQueueTemplate = defineWidgetTemplate({
  id: 'approvals-queue',
  title: 'Approvals queue',
  description: 'Pending HITL approvals as a live table fed by the approvals catalog entry.',
  rect: { x: 0, y: 0, w: 408, h: 320 },
  doc: {
    schemaVersion: 1,
    title: 'Pending approvals',
    primitive: 'custom',
    state: {},
    sources: [
      {
        kind: 'orgApi',
        id: 'approvals',
        method: 'GET',
        path: '/orgs/:orgId/approvals',
        query: { status: 'pending' },
        refresh: { mode: 'onEvent', topics: ['approval'] },
      },
    ],
    derived: {},
    config: {},
    items: [
      {
        id: 'queue',
        primitive: 'table',
        title: 'Approval queue',
        rect: itemRect(0, 0, 12, 8),
        props: {
          columns: [
            { key: 'kind', label: 'Kind', format: 'badge' },
            { key: 'question', label: 'Question', format: 'text' },
            { key: 'createdAt', label: 'Created', format: 'date' },
          ],
          sortable: true,
          maxRows: 20,
        },
        bindings: { rows: { ref: 'sources.approvals.items' } },
        on: {},
      },
    ],
  },
});
