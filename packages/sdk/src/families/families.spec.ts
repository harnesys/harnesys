import { describe, expect, test } from 'bun:test';
import { HookDescriptorSchema } from './hook.ts';
import { JobDescriptorSchema } from './job.ts';
import { INPUT_SCHEMA_MAX_DEPTH, validateInputSchema } from './json-schema.ts';
import { FAMILY_NAMES, familyRegistry } from './registry.ts';
import { RouteDescriptorSchema } from './route.ts';
import { ToolPackDescriptorSchema } from './tool-pack.ts';
import { TransportDescriptorSchema } from './transport.ts';
import { TriggerDescriptorSchema } from './trigger.ts';
import { ViewDescriptorSchema } from './view.ts';

describe('descriptor schemas', () => {
  test('tool-pack accepts a valid pack and rejects a bad effect', () => {
    const pack = {
      name: 'github',
      title: 'GitHub tools',
      description: 'Tools',
      tools: [
        {
          name: 'github.list_repos',
          description: 'List',
          inputSchema: { type: 'object' },
          effect: 'read',
        },
      ],
    };
    expect(ToolPackDescriptorSchema.safeParse(pack).success).toBe(true);
    const broken = { ...pack, tools: [{ ...pack.tools[0], effect: 'side-effect' }] };
    expect(ToolPackDescriptorSchema.safeParse(broken).success).toBe(false);
  });

  test('tool-pack rejects external $ref in tool input schemas', () => {
    const pack = {
      name: 'github',
      title: 'GitHub tools',
      description: 'Tools',
      tools: [
        {
          name: 't',
          description: 'd',
          inputSchema: { $ref: 'http://example.com/schema.json' },
          effect: 'read',
        },
      ],
    };
    const result = ToolPackDescriptorSchema.safeParse(pack);
    expect(result.success).toBe(false);
  });

  test('trigger, job, route, hook, transport descriptors parse', () => {
    expect(
      TriggerDescriptorSchema.safeParse({
        kind: 'telegram.feed',
        title: 'Feed',
        description: 'Feed',
        configFields: [{ key: 'chat', label: 'Chat', type: 'text', required: true }],
      }).success,
    ).toBe(true);
    expect(
      JobDescriptorSchema.safeParse({
        id: 'sync',
        title: 'Sync',
        schedule: { everySec: 60 },
        catchUp: 'none',
      }).success,
    ).toBe(true);
    expect(
      JobDescriptorSchema.safeParse({
        id: 'sync',
        title: 'Sync',
        schedule: { cron: '* * * * *' },
        catchUp: 'once',
      }).success,
    ).toBe(true);
    expect(
      RouteDescriptorSchema.safeParse({ id: 'items', method: 'GET', path: '/items/:id' }).success,
    ).toBe(true);
    expect(
      RouteDescriptorSchema.safeParse({ id: 'items', method: 'GET', path: 'items' }).success,
    ).toBe(false);
    expect(HookDescriptorSchema.safeParse({ id: 'h', on: { event: 'thread.*' } }).success).toBe(
      true,
    );
    expect(
      HookDescriptorSchema.safeParse({ id: 'h', on: { providerEvent: { connection: 'telegram' } } })
        .success,
    ).toBe(true);
    expect(
      TransportDescriptorSchema.safeParse({
        provider: 'telegram',
        title: 'Telegram',
        connection: 'telegram',
        capabilities: { threads: true, edit: false, typing: true, attachments: true },
        limits: { textMax: 4096 },
      }).success,
    ).toBe(true);
  });

  test('view descriptor parses declarative sections', () => {
    const view = {
      id: 'page',
      title: 'Demo page',
      sections: [
        { type: 'status' },
        {
          type: 'table',
          title: 'Items',
          source: { route: 'items' },
          columns: [{ key: 'name', label: 'Name', format: 'text' }],
        },
        {
          type: 'form',
          title: 'Add',
          fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
          submit: { route: 'items' },
        },
        { type: 'markdown', body: '# Hello' },
        { type: 'frame', route: 'frame', height: 300 },
      ],
    };
    expect(ViewDescriptorSchema.safeParse(view).success).toBe(true);
  });

  test('every family is registered with version 1 and a working schema', () => {
    expect(FAMILY_NAMES).toEqual([
      'tool-pack',
      'trigger',
      'job',
      'worker',
      'route',
      'transport',
      'hook',
      'content',
      'config',
      'view',
      'source-kind',
      'mcp',
      'lsp',
    ]);
    for (const name of FAMILY_NAMES) {
      const module = familyRegistry[name];
      if (!module) {
        throw new Error(`family '${name}' is missing from the registry`);
      }
      expect(module.versions).toContain(1);
      expect(module.schema(1)).toBeDefined();
      expect(() => module.schema(99)).toThrow();
    }
  });
});

describe('json-schema subset validator', () => {
  test('accepts a schema within the subset', () => {
    const schema = {
      type: 'object',
      properties: { q: { type: 'string', maxLength: 10 }, n: { type: 'integer', minimum: 0 } },
      required: ['q'],
      additionalProperties: false,
      $defs: { tag: { type: 'string', enum: ['a', 'b'] } },
    };
    expect(validateInputSchema(schema)).toEqual([]);
  });

  test('rejects external $ref', () => {
    const violations = validateInputSchema({ $ref: 'https://elsewhere/schema.json' });
    expect(violations.some((v) => v.code === 'external_ref')).toBe(true);
    expect(
      validateInputSchema({ $ref: '#/$defs/tag', $defs: { tag: { type: 'string' } } }),
    ).toEqual([]);
  });

  test('rejects depth over the limit', () => {
    let node: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < INPUT_SCHEMA_MAX_DEPTH + 2; i += 1) {
      node = { type: 'object', properties: { nested: node } };
    }
    const violations = validateInputSchema(node);
    expect(violations.some((v) => v.code === 'depth')).toBe(true);
  });

  test('rejects oversized schemas', () => {
    const schema = { type: 'object', properties: {} };
    for (let i = 0; i < 4000; i += 1) {
      (schema.properties as Record<string, unknown>)[
        `key${i}WithSomePaddingToGrowThePayload`.padEnd(20, 'x')
      ] = { type: 'string', description: 'x'.repeat(30) };
    }
    expect(validateInputSchema(schema).some((v) => v.code === 'size')).toBe(true);
  });

  test('rejects unknown keys and bad shapes', () => {
    expect(validateInputSchema({ type: 'object', findOneOf: 1 }).length).toBeGreaterThan(0);
    expect(validateInputSchema({ type: 'array', items: 'not-a-node' }).length).toBeGreaterThan(0);
  });
});
