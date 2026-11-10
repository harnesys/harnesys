import { describe, expect, test } from 'bun:test';
import { familyRegistry, protocolMap } from '@harnesys/sdk';
import { FAMILY_MODULE_CLASSES } from './index.ts';
import { JobFamilyModule } from './job/job.family.ts';
import { LspFamilyModule } from './lsp/lsp.family.ts';
import { buildFamilyBundle, snapshotOf } from './testing/bundle.ts';
import { MANIFEST } from './testing/fakes.ts';
import { ToolPackFamilyModule } from './tool-pack/tool-pack.family.ts';
import { TriggerFamilyModule } from './trigger/trigger.family.ts';

const OWNER = { orgId: 'org-1', addonId: 'acme.test', version: '1.0.0' };

describe('family modules conformance', () => {
  test('family list is the single source listing all 13 family modules', () => {
    expect(FAMILY_MODULE_CLASSES).toHaveLength(13);
    expect(FAMILY_MODULE_CLASSES).toContain(ToolPackFamilyModule);
    expect(FAMILY_MODULE_CLASSES).toContain(TriggerFamilyModule);
    expect(FAMILY_MODULE_CLASSES).toContain(JobFamilyModule);
    expect(FAMILY_MODULE_CLASSES).toContain(LspFamilyModule);
    const bundle = buildFamilyBundle();
    const families = [
      bundle.toolPack,
      bundle.trigger,
      bundle.job,
      bundle.worker,
      bundle.route,
      bundle.transport,
      bundle.hook,
      bundle.content,
      bundle.config,
      bundle.view,
      bundle.sourceKind,
      bundle.mcp,
      bundle.lsp,
    ].map((moduleInstance) => moduleInstance.family);
    expect(new Set(families).size).toBe(13);
  });

  test('schema versions and handlers conform to the SDK registry and protocol map', () => {
    const bundle = buildFamilyBundle();
    const modules = [
      bundle.toolPack,
      bundle.trigger,
      bundle.job,
      bundle.worker,
      bundle.route,
      bundle.transport,
      bundle.hook,
      bundle.content,
      bundle.config,
      bundle.view,
      bundle.sourceKind,
      bundle.mcp,
      bundle.lsp,
    ];
    for (const moduleInstance of modules) {
      expect(familyRegistry[moduleInstance.family]).toBeDefined();
      expect(moduleInstance.versions.length).toBeGreaterThan(0);
      for (const version of moduleInstance.versions) {
        expect(() => moduleInstance.schema(version)).not.toThrow();
      }
      for (const handler of moduleInstance.handlers) {
        const spec = protocolMap[handler.method];
        expect(spec).toBeDefined();
        expect(spec.direction).toBe('host-to-addon');
      }
    }
  });

  test('register then dispose leaves every registry equal to the pre-activate snapshot', () => {
    const bundle = buildFamilyBundle();
    const before = snapshotOf(bundle);
    const disposables = [
      bundle.toolPack.register(OWNER, {
        name: 'github',
        title: 'GitHub tools',
        description: 'tools',
        tools: [
          {
            name: 'list_repos',
            description: 'list',
            inputSchema: { type: 'object', properties: {} },
            effect: 'read',
          },
        ],
      }),
      bundle.trigger.register(OWNER, {
        kind: 'feed',
        title: 'Feed',
        description: 'feed',
        configFields: [],
      }),
      bundle.job.register(OWNER, {
        id: 'sync',
        title: 'Sync',
        schedule: { everySec: 30 },
        catchUp: 'none',
      }),
      bundle.worker.register(OWNER, {
        id: 'poller',
        title: 'Poller',
        autostart: true,
        restart: 'on-failure',
      }),
      bundle.route.register(OWNER, { id: 'items', method: 'GET', path: '/items/:id' }),
      bundle.transport.register(OWNER, {
        provider: 'acme-chat',
        title: 'Acme chat',
        connection: 'github',
        capabilities: { threads: false, edit: true, typing: true, attachments: false },
        limits: { textMax: 4096 },
      }),
      bundle.hook.register(OWNER, { id: 'on-thread', on: { event: 'thread.*' } }),
      bundle.hook.register(OWNER, {
        id: 'on-provider',
        on: { providerEvent: { connection: 'github', types: ['push'] } },
      }),
      bundle.content.register(OWNER, {
        id: 'guide',
        title: 'Guide',
        kind: 'skill',
        path: 'content/guide.md',
      }),
      bundle.config.register(OWNER, { fields: [] }),
      bundle.view.register(OWNER, { id: 'page', title: 'Page', sections: [{ type: 'status' }] }),
      bundle.sourceKind.register(OWNER, { id: 'drive', title: 'Drive' }),
      bundle.mcp.register(OWNER, { id: 'server', title: 'MCP' }),
      bundle.lsp.register(OWNER, { id: 'lsp', title: 'LSP' }),
    ];
    const during = snapshotOf(bundle);
    expect(during).not.toBe(before);
    for (const disposable of [...disposables].reverse()) {
      disposable.dispose();
    }
    expect(snapshotOf(bundle)).toBe(before);
    for (const disposable of disposables) {
      expect(() => disposable.dispose()).not.toThrow();
    }
  });

  test('tool-pack registration carries tool effect and addon-prefixed names', () => {
    const bundle = buildFamilyBundle();
    const disposable = bundle.toolPack.register(OWNER, {
      name: 'github',
      title: 'GitHub tools',
      description: 'tools',
      tools: [
        {
          name: 'create_issue',
          description: 'create',
          inputSchema: { type: 'object', properties: {} },
          effect: 'destructive',
        },
        {
          name: 'list_repos',
          description: 'list',
          inputSchema: { type: 'object', properties: {} },
          effect: 'read',
        },
      ],
    });
    const registration = bundle.packs.find('acme.test.github');
    expect(registration).toBeDefined();
    const create = registration?.pack.create as
      | (() => { tools?: Array<{ name: string; sideEffect?: string }> })
      | undefined;
    const tools = (create?.() ?? { tools: [] }) as {
      tools?: Array<{ name: string; sideEffect?: string }>;
    };
    expect(tools.tools?.map((tool) => tool.name)).toEqual([
      'acme.test.create_issue',
      'acme.test.list_repos',
    ]);
    expect(tools.tools?.find((tool) => tool.name === 'acme.test.create_issue')?.sideEffect).toBe(
      'destructive',
    );
    expect(tools.tools?.find((tool) => tool.name === 'acme.test.list_repos')?.sideEffect).toBe(
      'read',
    );
    disposable.dispose();
    expect(bundle.packs.find('acme.test.github')).toBeUndefined();
  });

  test('tool-pack crossCheck reports unknown connection and unknown skills', () => {
    const bundle = buildFamilyBundle();
    const violations = bundle.toolPack.crossCheck(
      {
        name: 'github',
        title: 'GitHub tools',
        description: 'tools',
        connection: 'gitlab',
        skills: ['missing'],
        tools: [
          {
            name: 'list',
            description: 'list',
            inputSchema: { type: 'object', properties: {} },
            effect: 'read',
          },
        ],
      },
      MANIFEST,
    );
    expect(violations.map((violation) => violation.code)).toEqual([
      'unknown_connection',
      'unknown_skill',
    ]);
  });
});
