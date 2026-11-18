import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const clickCounterTemplate = defineWidgetTemplate({
  id: 'click-counter',
  title: 'Click counter',
  description: 'Persistent local counter with increment, decrement and reset buttons.',
  rect: { x: 0, y: 0, w: 408, h: 160 },
  doc: {
    schemaVersion: 1,
    title: 'Click counter',
    primitive: 'custom',
    state: { count: 0 },
    persistedState: ['count'],
    sources: [],
    derived: {},
    config: {},
    items: [
      {
        id: 'counter',
        primitive: 'metric',
        title: 'Count',
        rect: itemRect(0, 0, 12, 2),
        props: { label: 'Clicks', format: 'number' },
        bindings: { value: { ref: 'state.count' } },
        on: {},
      },
      {
        id: 'increment',
        primitive: 'button',
        title: 'Increment',
        rect: itemRect(0, 2, 4, 1),
        props: { label: '+1' },
        bindings: {},
        on: { click: { type: 'incrementState', key: 'count', delta: 1 } },
      },
      {
        id: 'decrement',
        primitive: 'button',
        title: 'Decrement',
        rect: itemRect(4, 2, 4, 1),
        props: { label: '-1', variant: 'outline' },
        bindings: {},
        on: { click: { type: 'incrementState', key: 'count', delta: -1 } },
      },
      {
        id: 'reset',
        primitive: 'button',
        title: 'Reset',
        rect: itemRect(8, 2, 4, 1),
        props: { label: 'Reset', variant: 'ghost' },
        bindings: {},
        on: { click: { type: 'setState', key: 'count', value: 0 } },
      },
    ],
  },
});
