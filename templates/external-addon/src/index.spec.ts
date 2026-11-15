import { describe, expect, test } from 'bun:test';
import { parseAddonManifest, validateManifest } from '@harnesys/sdk';
import { createFakeHost, type FakeHost } from '@harnesys/sdk/testing';
import { ADDON_ID, ADDON_VERSION, addon } from './index.ts';

const rawManifest: unknown = await Bun.file(new URL('../addon.json', import.meta.url)).json();
const migration = await Bun.file(new URL('../migrations/0001_init.sql', import.meta.url)).text();
const manifest = parseAddonManifest(rawManifest);

interface ToolRef {
  name: string;
  effect: string;
}

interface ToolPackDescriptor {
  name: string;
  tools: ToolRef[];
}

interface RouteDescriptor {
  id: string;
  path: string;
}

interface ConfigField {
  key: string;
  type: string;
  default?: string;
}

interface ConfigDescriptor {
  fields: ConfigField[];
}

function descriptorOf<T>(family: string): T {
  const contribution = manifest.contributions.find((item) => item.family === family);
  if (contribution === undefined) {
    throw new Error(`the manifest has no ${family} contribution`);
  }
  return contribution.descriptor as T;
}

const packDescriptor = descriptorOf<ToolPackDescriptor>('tool-pack');
const routeDescriptor = descriptorOf<RouteDescriptor>('route');
const configDescriptor = descriptorOf<ConfigDescriptor>('config');

const packName = packDescriptor.name;

function toolByEffect(effect: string): ToolRef {
  const tool = packDescriptor.tools.find((item) => item.effect === effect);
  if (tool === undefined) {
    throw new Error(`the pack declares no ${effect} tool`);
  }
  return tool;
}

const writeTool = toolByEffect('write');
const readTool = toolByEffect('read');

const defaultField = configDescriptor.fields.find((field) => field.default !== undefined);
if (defaultField === undefined) {
  throw new Error('the settings form declares no field with a default value');
}
const defaultConfig: Record<string, unknown> = { [defaultField.key]: defaultField.default };

async function makeHost(): Promise<FakeHost> {
  const host = createFakeHost({ definition: addon, manifest, config: defaultConfig });
  await host.service('db.exec', { sql: migration });
  return host;
}

describe('manifest and definition parity', () => {
  test('parses and validates with no error violations', () => {
    const { violations } = validateManifest(rawManifest);
    expect(violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });

  test('the definition identity matches the manifest the scaffolder rewrote', () => {
    expect(ADDON_ID).toBe(manifest.id);
    expect(ADDON_VERSION).toBe(manifest.version);
    expect(manifest.runtime).toEqual({ entry: 'dist/index.js', profile: 'trusted' });
    expect(manifest.contributions.map((contribution) => contribution.family).sort()).toEqual([
      'config',
      'content',
      'route',
      'tool-pack',
    ]);
  });

  test('every contribution has a handler and every handler a matching key', () => {
    const host = createFakeHost({ definition: addon, manifest });
    expect(addon.handlers).toContain('tools.call');
    expect(addon.handlers).toContain('route.handle');
    expect(Object.keys(addon.tools ?? {}).sort()).toEqual(
      packDescriptor.tools.map((tool) => tool.name).sort(),
    );
    expect(Object.keys(addon.routes ?? {})).toContain(routeDescriptor.id);
    host.close();
  });
});

describe('tools and route', () => {
  test('the write tool stores a row and the read tool returns it', async () => {
    const host = await makeHost();
    const added = await host.callTool(packName, writeTool.name, {
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    expect(added.output).toEqual({
      id: 1,
      title: 'Docs',
      url: 'https://example.com/docs',
      tag: defaultField.default,
      createdAt: expect.any(String),
    });
    const listed = await host.callTool(packName, readTool.name, {});
    expect(listed.output).toEqual({
      rows: [expect.objectContaining({ id: 1, title: 'Docs', tag: defaultField.default })],
    });
    host.close();
  });

  test('the write tool rejects a missing url', async () => {
    const host = await makeHost();
    await expect(
      host.callTool(packName, writeTool.name, { title: 'No url' }),
    ).rejects.toMatchObject({
      reason: 'invalid_params',
    });
    host.close();
  });

  test('the declared route returns the stored rows', async () => {
    const host = await makeHost();
    await host.callTool(packName, writeTool.name, {
      title: 'Route',
      url: 'https://example.com/route',
      tag: 'links',
    });
    const route = await host.callRoute(routeDescriptor.id, {
      path: routeDescriptor.path,
      query: { limit: '5' },
    });
    expect(route.status).toBe(200);
    expect(route.body).toEqual({
      rows: [expect.objectContaining({ title: 'Route', tag: 'links' })],
    });
    host.close();
  });

  test('the config.changed notification is handled', async () => {
    const host = await makeHost();
    await host.notify('config.changed', { keys: [defaultField.key] });
    expect(host.logs.some((line) => line.message === 'config changed')).toBe(true);
    host.close();
  });
});
