import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const spendChartTemplate = defineWidgetTemplate({
  id: 'spend-chart',
  title: 'Spend chart',
  description: 'Cost per day plus the org total from the usage catalog entry.',
  rect: { x: 0, y: 0, w: 408, h: 320 },
  doc: {
    schemaVersion: 1,
    title: 'Spend',
    primitive: 'custom',
    state: {},
    sources: [
      {
        kind: 'orgApi',
        id: 'usage',
        method: 'GET',
        path: '/orgs/:orgId/usage',
        query: { groupBy: 'day' },
        refresh: { mode: 'onMount' },
      },
    ],
    derived: {
      daily: { fn: 'sort', args: [{ ref: 'sources.usage.rows' }, 'key'] },
    },
    config: {},
    items: [
      {
        id: 'total',
        primitive: 'metric',
        title: 'Total spend',
        rect: itemRect(0, 0, 12, 2),
        props: { label: 'Total spend', format: 'currency' },
        bindings: { value: { ref: 'sources.usage.totals.costUsd' } },
        on: {},
      },
      {
        id: 'trend',
        primitive: 'chart',
        title: 'Daily cost',
        rect: itemRect(0, 2, 12, 6),
        props: { kind: 'bar', xKey: 'key', yKey: 'costUsd' },
        bindings: { data: { ref: 'derived.daily' } },
        on: {},
      },
    ],
  },
});
