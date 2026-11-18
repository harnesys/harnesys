import { itemRect } from '../doc.ts';
import { defineWidgetTemplate } from './define.ts';

export const notesTemplate = defineWidgetTemplate({
  id: 'notes',
  title: 'Notes',
  description: 'Persistent note list: add a note, close it, reopen a closed one.',
  rect: { x: 0, y: 0, w: 408, h: 368 },
  doc: {
    schemaVersion: 1,
    title: 'Notes',
    icon: 'boxes',
    primitive: 'custom',
    state: { draft: '', notes: [], done: [], seq: 0 },
    persistedState: ['notes', 'done', 'seq'],
    sources: [],
    derived: {},
    config: {},
    items: [
      {
        id: 'draft',
        primitive: 'input',
        title: 'New note',
        rect: itemRect(0, 0, 9, 2),
        props: { stateKey: 'draft', placeholder: 'Write a note' },
        bindings: {},
        on: {},
      },
      {
        id: 'add',
        primitive: 'button',
        title: 'Add note',
        rect: { x: 288, y: 16, w: 96, h: 32 },
        props: { label: 'Add', variant: 'secondary' },
        bindings: { disabled: { fn: 'eq', args: [{ ref: 'state.draft' }, ''] } },
        on: {
          click: {
            type: 'sequence',
            actions: [
              { type: 'incrementState', key: 'seq', delta: 1 },
              {
                type: 'setState',
                key: 'notes',
                value: {
                  fn: 'if',
                  args: [
                    { fn: 'eq', args: [{ ref: 'state.draft' }, ''] },
                    { ref: 'state.notes' },
                    {
                      fn: 'concat',
                      args: [
                        { ref: 'state.notes' },
                        [{ id: { ref: 'state.seq' }, text: { ref: 'state.draft' } }],
                      ],
                    },
                  ],
                },
              },
              { type: 'setState', key: 'draft', value: '' },
            ],
          },
        },
      },
      {
        id: 'open',
        primitive: 'list',
        title: 'Open notes',
        rect: itemRect(0, 2, 12, 5),
        props: { primaryText: 'text' },
        bindings: { items: { ref: 'state.notes' } },
        on: {
          itemClick: {
            type: 'sequence',
            actions: [
              {
                type: 'setState',
                key: 'done',
                value: { fn: 'concat', args: [{ ref: 'state.done' }, [{ ref: 'row' }]] },
              },
              {
                type: 'setState',
                key: 'notes',
                value: {
                  fn: 'where',
                  args: [{ ref: 'state.notes' }, 'id', 'neq', { ref: 'row.id' }],
                },
              },
            ],
          },
        },
      },
      {
        id: 'closed',
        primitive: 'list',
        title: 'Closed notes',
        rect: itemRect(0, 7, 12, 3),
        props: {
          primaryText: 'text',
          rowBindings: { text: { fn: 'concat', args: ['✓ ', { ref: 'row.text' }] } },
        },
        bindings: { items: { ref: 'state.done' } },
        on: {
          itemClick: {
            type: 'sequence',
            actions: [
              {
                type: 'setState',
                key: 'notes',
                value: { fn: 'concat', args: [{ ref: 'state.notes' }, [{ ref: 'row' }]] },
              },
              {
                type: 'setState',
                key: 'done',
                value: {
                  fn: 'where',
                  args: [{ ref: 'state.done' }, 'id', 'neq', { ref: 'row.id' }],
                },
              },
            ],
          },
        },
      },
    ],
  },
});
