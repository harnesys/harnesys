import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const blankTemplate = defineWidgetTemplate({
  id: 'blank',
  title: 'Blank',
  description: 'One markdown box filling the widget body, ready to replace.',
  rect: { x: 0, y: 0, w: 408, h: 320 },
  doc: {
    schemaVersion: 1,
    title: 'Untitled widget',
    icon: 'layout-dashboard',
    primitive: 'custom',
    state: {},
    sources: [],
    derived: {},
    config: {},
    items: [
      {
        id: 'note',
        primitive: 'markdown',
        title: 'Content',
        rect: itemRect(0, 0, 12, 8),
        props: { text: '# Untitled widget\n\nReplace this text or the primitive.' },
        bindings: {},
        on: {},
      },
    ],
  },
});
