import { describe, expect, test } from 'bun:test';
import { parseAddonManifest, validateManifest } from '@harnesys/sdk';
import { createFakeHost, type FakeHost } from '@harnesys/sdk/testing';
import { addon } from './index.ts';

const rawManifest: unknown = await Bun.file(new URL('../addon.json', import.meta.url)).json();
const migration = await Bun.file(new URL('../migrations/0001_init.sql', import.meta.url)).text();
const manifest = parseAddonManifest(rawManifest);

async function makeHost(): Promise<FakeHost> {
  const host = createFakeHost({ definition: addon, manifest, config: { default_tag: 'inbox' } });
  await host.service('db.exec', { sql: migration });
  return host;
}

describe('acme.example manifest', () => {
  test('parses and validates with no error violations', () => {
    const { violations } = validateManifest(rawManifest);
    expect(violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });

  test('declares the documented identity and contributions', () => {
    expect(manifest.id).toBe('acme.example');
    expect(manifest.platform).toBe(1);
    expect(manifest.runtime).toEqual({ entry: 'dist/index.js', profile: 'trusted' });
    expect(manifest.contributions.map((contribution) => contribution.family).sort()).toEqual([
      'config',
      'content',
      'route',
      'tool-pack',
    ]);
  });

  test('the definition declares a handler for every contribution', () => {
    const host = createFakeHost({ definition: addon, manifest });
    expect(addon.handlers).toContain('tools.call');
    expect(addon.handlers).toContain('route.handle');
    host.close();
  });
});

describe('acme.example tools and route', () => {
  test('add stores a bookmark and list returns it', async () => {
    const host = await makeHost();
    const added = await host.callTool('bookmarks', 'add', {
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    expect(added.output).toEqual({
      id: 1,
      title: 'Docs',
      url: 'https://example.com/docs',
      tag: 'inbox',
      createdAt: expect.any(String),
    });
    const listed = await host.callTool('bookmarks', 'list', {});
    expect(listed.output).toEqual({
      rows: [expect.objectContaining({ id: 1, title: 'Docs', tag: 'inbox' })],
    });
    host.close();
  });

  test('add rejects a missing url', async () => {
    const host = await makeHost();
    await expect(host.callTool('bookmarks', 'add', { title: 'No url' })).rejects.toMatchObject({
      reason: 'invalid_params',
    });
    host.close();
  });

  test('the items route returns the stored rows', async () => {
    const host = await makeHost();
    await host.callTool('bookmarks', 'add', {
      title: 'Route',
      url: 'https://example.com/route',
      tag: 'links',
    });
    const route = await host.callRoute('items', { path: '/items', query: { limit: '5' } });
    expect(route.status).toBe(200);
    expect(route.body).toEqual({
      rows: [expect.objectContaining({ title: 'Route', tag: 'links' })],
    });
    host.close();
  });

  test('the config.changed notification is handled', async () => {
    const host = await makeHost();
    await host.notify('config.changed', { keys: ['default_tag'] });
    expect(host.logs.some((line) => line.message === 'config changed')).toBe(true);
    host.close();
  });
});
