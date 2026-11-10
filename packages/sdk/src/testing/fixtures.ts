import type { ResolvedAddonDefinition } from '../define-addon.ts';
import { defineAddon } from '../define-addon.ts';
import type { AddonManifest } from '../manifest/manifest.ts';

export function validManifest(): AddonManifest {
  return {
    id: 'harnesys.demo',
    version: '1.0.0',
    platform: 1,
    title: 'Demo',
    description: 'Demo addon',
    runtime: { entry: './dist/index.js', profile: 'restricted' },
    activation: 'lazy',
    permissions: [
      { id: 'http.fetch', scope: { hosts: ['api.example.com'] }, reason: 'Calls the example API' },
    ],
    connections: [
      {
        id: 'example',
        label: 'Example connection',
        accountKinds: ['example-account'],
        cardinality: 'many',
      },
    ],
    contributions: [
      {
        id: 'pack',
        family: 'tool-pack',
        descriptor: {
          name: 'example',
          title: 'Example tools',
          description: 'Tools for the demo',
          connection: 'example',
          tools: [
            {
              name: 'example.ping',
              description: 'Ping',
              inputSchema: { type: 'object' },
              effect: 'read',
            },
          ],
        },
      },
      {
        id: 'hook',
        family: 'hook',
        descriptor: { id: 'onThread', on: { event: 'thread.*' } },
      },
    ],
  };
}

export function demoDefinition(): ResolvedAddonDefinition {
  return defineAddon({
    tools: {
      'example.ping': (input, ctx) => ({ pong: true, echo: input, org: ctx.meta.correlationId }),
    },
    routes: {
      items: async () => ({ status: 200, body: { rows: [] } }),
    },
    triggers: {
      'telegram.feed': {
        start: async () => undefined,
        stop: async () => undefined,
      },
    },
    jobs: {
      sync: async (_params, ctx) => {
        await ctx.log.info('job ran');
      },
    },
    hooks: {
      onThread: async () => undefined,
    },
    transport: {
      typing: async () => undefined,
    },
  });
}
