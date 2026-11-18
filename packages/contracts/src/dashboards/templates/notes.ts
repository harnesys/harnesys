import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const notesTemplate = defineWidgetTemplate({
  id: 'notes',
  title: 'Notes',
  description: 'Persistent note field mirrored live by a markdown box.',
  rect: { x: 0, y: 0, w: 408, h: 320 },
  doc: {
    schemaVersion: 1,
    title: 'Notes',
    primitive: 'custom',
    state: { note: 'Write anything here. It is saved with this widget.' },
    persistedState: ['note'],
    sources: [],
    derived: {},
    config: {},
    items: [
      {
        id: 'note-input',
        primitive: 'input',
        title: 'Note field',
        rect: itemRect(0, 0, 12, 2),
        props: { stateKey: 'note', label: 'Note', placeholder: 'Type a note' },
        bindings: {},
        on: {},
      },
      {
        id: 'note-view',
        primitive: 'markdown',
        title: 'Note preview',
        rect: itemRect(0, 2, 12, 6),
        props: {},
        bindings: { text: { tpl: '{{state.note}}' } },
        on: {},
      },
    ],
  },
});
