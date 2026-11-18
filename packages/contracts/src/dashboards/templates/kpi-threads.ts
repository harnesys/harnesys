import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const kpiThreadsTemplate = defineWidgetTemplate({
  id: 'kpi-threads',
  title: 'KPI: threads',
  description: 'Thread count and unread threads from the threads catalog entry.',
  rect: { x: 0, y: 0, w: 408, h: 160 },
  doc: {
    schemaVersion: 1,
    title: 'Threads',
    primitive: 'custom',
    state: {},
    sources: [
      {
        kind: 'orgApi',
        id: 'threads',
        method: 'GET',
        path: '/orgs/:orgId/threads',
        refresh: { mode: 'onEvent', topics: ['desk', 'thread-error'] },
      },
    ],
    derived: {
      total: { fn: 'count', args: [{ ref: 'sources.threads.items' }] },
      unread: {
        fn: 'count',
        args: [{ fn: 'filter', args: [{ ref: 'sources.threads.items' }, 'unread'] }],
      },
    },
    config: {},
    items: [
      {
        id: 'total',
        primitive: 'metric',
        title: 'Total threads',
        rect: itemRect(0, 0, 6, 2),
        props: { label: 'Threads', format: 'number' },
        bindings: { value: { ref: 'derived.total' } },
        on: {},
      },
      {
        id: 'unread',
        primitive: 'metric',
        title: 'Unread threads',
        rect: itemRect(6, 0, 6, 2),
        props: { label: 'Unread', format: 'number' },
        bindings: { value: { ref: 'derived.unread' } },
        on: {},
      },
    ],
  },
});
