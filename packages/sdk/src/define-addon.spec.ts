import { describe, expect, test } from 'bun:test';
import { defineAddon, deriveHandlers } from './define-addon.ts';
import { demoDefinition } from './testing/fixtures.ts';

describe('defineAddon handlers derivation', () => {
  test('empty definition only declares ping and shutdown', () => {
    expect(deriveHandlers({})).toEqual(['ping', 'shutdown']);
  });

  test('derives handlers per family', () => {
    expect(demoDefinition().handlers).toEqual([
      'ping',
      'shutdown',
      'tools.call',
      'route.handle',
      'trigger.start',
      'trigger.stop',
      'job.run',
      'transport.typing',
      'hook.deliver',
    ]);
  });

  test('trigger and worker pairs derive both phases', () => {
    const resolved = defineAddon({
      triggers: { feed: { start: async () => undefined, stop: async () => undefined } },
      workers: { poller: { start: async () => undefined, stop: async () => undefined } },
      routes: { items: async () => ({ status: 200 }) },
      transport: {
        send: async () => ({}),
        edit: async () => undefined,
        typing: async () => undefined,
      },
      lifecycle: { upgrade: async () => undefined },
    });
    expect(resolved.handlers).toEqual([
      'ping',
      'shutdown',
      'route.handle',
      'trigger.start',
      'trigger.stop',
      'worker.start',
      'worker.stop',
      'transport.send',
      'transport.edit',
      'transport.typing',
      'lifecycle.upgrade',
    ]);
  });

  test('defineAddon returns a resolved definition with handlers', () => {
    const resolved = defineAddon({ jobs: { sync: async () => undefined } });
    expect(resolved.handlers).toContain('job.run');
  });
});
